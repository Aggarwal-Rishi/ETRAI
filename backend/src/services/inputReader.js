const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const { processMediaAnalysis } = require('./media/mediaOrchestrator');
const { isSsrfSafeUrl } = require('./ssrfGuard');

const MIN_WORD_COUNT = 15;
const MAX_CHAR_LIMIT = 48000; // ~12,000 tokens
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Counts words in a string
 */
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Decodes all common numeric and named HTML entities
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#0*34;/gi, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#0*160;/gi, ' ')
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Extracts metadata and embedded assets from HTML without fabricating missing data
 */
function extractHtmlAssetsAndMetadata(html, url = '') {
  if (!html) return { metadata: {}, discoveredAssets: { images: [], videos: [], outboundLinks: [] } };

  let title = null;
  let author = null;
  let publisher = null;
  let publishedAt = null;
  let description = null;
  let canonicalUrl = null;
  let favicon = null;

  // Title
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitleMatch) title = decodeHtmlEntities(ogTitleMatch[1]).trim();
  else if (titleTagMatch) title = decodeHtmlEntities(titleTagMatch[1]).trim();

  // Author
  const authorMeta = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
  if (authorMeta) author = decodeHtmlEntities(authorMeta[1]).trim();

  // Publisher / Site Name
  const siteNameMeta = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (siteNameMeta) publisher = decodeHtmlEntities(siteNameMeta[1]).trim();

  // Published Date (Real extracted date, null if missing)
  const publishedMeta = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+name=["']publish-date["'][^>]+content=["']([^"']+)["']/i);
  if (publishedMeta) {
    const d = new Date(publishedMeta[1]);
    if (!isNaN(d.getTime())) publishedAt = d.toISOString();
  }

  // Description
  const descMeta = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMeta) description = decodeHtmlEntities(descMeta[1]).trim();

  // Canonical URL
  const canonicalMeta = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMeta) canonicalUrl = canonicalMeta[1];

  // Favicon
  const faviconMeta = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
  if (faviconMeta) favicon = faviconMeta[1];

  // Discovered Images
  const images = [];
  const ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImgMatch) {
    images.push({ url: ogImgMatch[1], alt: title || 'Lead preview image', isLead: true });
  }

  const imgTags = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  for (const img of imgTags.slice(0, 10)) {
    const srcMatch = img.match(/src=["']([^"']+)["']/i);
    const altMatch = img.match(/alt=["']([^"']*)["']/i);
    if (srcMatch && !srcMatch[1].startsWith('data:') && !images.some(i => i.url === srcMatch[1])) {
      images.push({
        url: srcMatch[1],
        alt: altMatch ? decodeHtmlEntities(altMatch[1]).trim() : null,
        isLead: false
      });
    }
  }

  // Discovered Videos
  const videos = [];
  const youtubeMatches = html.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi) || [];
  for (const yt of youtubeMatches) {
    if (!videos.some(v => v.url === yt)) {
      videos.push({ url: yt, provider: 'youtube', videoId: yt.slice(-11) });
    }
  }

  const videoTagMatches = html.match(/<(?:video|source)[^>]+src=["']([^"']+\.mp4[^"']*)["']/gi) || [];
  for (const vt of videoTagMatches) {
    const src = vt.match(/src=["']([^"']+)["']/i);
    if (src && !videos.some(v => v.url === src[1])) {
      videos.push({ url: src[1], provider: 'mp4', videoId: null });
    }
  }

  // Discovered Outbound Citations & Hyperlinks
  const outboundLinks = [];
  const aTags = html.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
  for (const a of aTags.slice(0, 15)) {
    const hrefMatch = a.match(/href=["']([^"']+)["']/i);
    const textMatch = a.replace(/<[^>]+>/g, '').trim();
    if (hrefMatch && hrefMatch[1] !== url && !outboundLinks.some(l => l.url === hrefMatch[1])) {
      outboundLinks.push({
        url: hrefMatch[1],
        anchorText: decodeHtmlEntities(textMatch).slice(0, 100)
      });
    }
  }

  return {
    metadata: {
      title,
      author,
      publisher,
      publishedAt,
      description,
      canonicalUrl: canonicalUrl || url,
      favicon
    },
    discoveredAssets: {
      images,
      videos,
      outboundLinks
    }
  };
}

/**
 * Strips HTML tags, scripts, and styles to get clean text
 */
function cleanHtml(html) {
  if (!html) return '';

  // 1. Priority: Extract JSON-LD NewsArticle / Article schema articleBody if available
  const jsonLdMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const scriptTag of jsonLdMatches) {
    try {
      const jsonContent = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      const parsed = JSON.parse(jsonContent);
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of objects) {
        if (obj && (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article') && obj.articleBody) {
          const headline = obj.headline ? `${obj.headline}. ` : '';
          return decodeHtmlEntities(`${headline}${obj.articleBody}`).replace(/\s+/g, ' ').trim();
        }
      }
    } catch (e) {}
  }

  // 2. Check for <article> content block
  const articleTagMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleTagMatch) {
    let articleHtml = articleTagMatch[1].replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, '');
    let clean = articleHtml.replace(/<[^>]+>/g, ' ');
    clean = decodeHtmlEntities(clean).replace(/\s+/g, ' ').trim();
    if (clean.length > 200) {
      return clean;
    }
  }

  // 3. Fallback to general HTML tag stripping
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  clean = clean.replace(/<[^>]+>/g, ' ');
  clean = decodeHtmlEntities(clean);
  if (ogTitleMatch && ogDescMatch) {
    clean = `${decodeHtmlEntities(ogTitleMatch[1])}. ${decodeHtmlEntities(ogDescMatch[1])}. ${clean}`;
  }
  clean = clean.replace(/(?<=[.?!])(?=[A-Z])/g, ' ');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Comprehensive General Structural Markup & Formatting Cleaner
 */
function cleanExtractedText(rawStr) {
  if (!rawStr) return '';
  let str = rawStr;

  str = str
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");

  str = decodeHtmlEntities(str);
  str = str.replace(/<[^>]+>/g, ' ');
  str = str.replace(/\[\[(?:Category|File|Image|Special):[^\]]+\]\]/gi, '');
  str = str.replace(/\[\[([^\]\|]+)\|([^\]]+)\]\]/g, '$2');
  str = str.replace(/\[\[([^\]]+)\]\]/g, '$1');
  str = str.replace(/\{\{[^\}]+\}\}/g, '');
  str = str.replace(/\[(?:\d+|citation needed|note\s*\d+|edit|src)\]/gi, '');
  str = str.replace(/\(\s*\)/g, '');
  str = str.replace(/\[\s*\]/g, '');
  str = str.replace(/\s+([.,;:?!])/g, '$1');

  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Unified Multi-Modal Input Processor (Agent 1)
 * Handles URLs, Files (PDF/DOCX/TXT), Raw Text, and Media with truthful metadata extraction.
 */
async function processInputContent({ inputType, text, url, file }) {
  let rawText = '';
  let sourceTitle = '';
  let metadata = {
    author: null,
    publisher: null,
    publishedAt: null,
    description: null,
    canonicalUrl: url || null,
    favicon: null,
    mimeType: 'text/plain',
    sizeBytes: 0,
    sha256: null,
    pageCount: null
  };
  let discoveredAssets = {
    images: [],
    videos: [],
    outboundLinks: []
  };

  // 1. Process Based on Input Type
  if (inputType === 'TEXT') {
    if (!text || typeof text !== 'string') {
      const err = new Error('Pasted text content is required.');
      err.status = 400;
      throw err;
    }
    rawText = text.trim();
    const firstLine = rawText.split('\n')[0].substring(0, 60);
    sourceTitle = firstLine ? `Text: "${firstLine}..."` : 'Pasted Text Analysis';
    metadata.sizeBytes = Buffer.byteLength(rawText, 'utf8');
    metadata.sha256 = crypto.createHash('sha256').update(rawText).digest('hex');
  } 
  else if (inputType === 'FILE') {
    if (!file || !file.buffer) {
      const err = new Error('File upload payload missing or invalid.');
      err.status = 400;
      throw err;
    }

    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      const err = new Error(`File exceeds maximum permitted size of 50MB (${(file.buffer.length / (1024*1024)).toFixed(1)}MB).`);
      err.status = 400;
      throw err;
    }

    const filename = file.originalname || 'Uploaded Document';
    sourceTitle = `File: ${filename}`;
    const ext = path.extname(filename).toLowerCase();
    metadata.mimeType = file.mimetype || 'application/octet-stream';
    metadata.sizeBytes = file.buffer.length;
    metadata.sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

    try {
      if (ext === '.pdf' || file.mimetype === 'application/pdf') {
        const parsed = await pdfParse(file.buffer);
        rawText = parsed.text;
        metadata.pageCount = parsed.numpages || null;
      } else if (
        ext === '.docx' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        rawText = parsed.value;
      } else if (ext === '.txt' || file.mimetype === 'text/plain') {
        rawText = file.buffer.toString('utf-8');
      } else {
        const err = new Error('Unsupported file format. Accepted formats are PDF (.pdf), Word Document (.docx), and plain text (.txt).');
        err.status = 400;
        throw err;
      }
    } catch (parseError) {
      if (parseError.status) throw parseError;
      const err = new Error('Failed to parse document content. Unsupported or corrupted file format.');
      err.status = 400;
      throw err;
    }
  } 
  else if (inputType === 'URL') {
    if (!url || typeof url !== 'string') {
      const err = new Error('A valid URL is required.');
      err.status = 400;
      throw err;
    }

    const ssrfCheck = isSsrfSafeUrl(url);
    if (!ssrfCheck.safe) {
      const err = new Error(`Invalid or restricted URL: ${ssrfCheck.reason}`);
      err.status = 400;
      throw err;
    }

    // Check if it is a direct video URL (e.g. YouTube or direct MP4 stream)
    const isYouTubeUrl = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.test(url);
    if (isYouTubeUrl) {
      sourceTitle = `Video URL: ${url}`;
      discoveredAssets.videos.push({ url, provider: 'youtube', videoId: url.match(/([a-zA-Z0-9_-]{11})/)?.[1] || null });
    } else {
      sourceTitle = `URL: ${url}`;
    }
    
    let htmlContent = '';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    try {
      const response = await fetch(url, { headers, timeout: 12000 });
      if (response.ok) {
        htmlContent = await response.text();
      } else {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        const cacheResp = await fetch(cacheUrl, { headers, timeout: 8000 });
        if (cacheResp.ok) {
          htmlContent = await cacheResp.text();
        }
      }
    } catch (e) {}

    if (!htmlContent) {
      const err = new Error('Unable to extract content from the provided URL. The page may be paywalled, blocked, or offline.');
      err.status = 422;
      throw err;
    }

    const extractedAssets = extractHtmlAssetsAndMetadata(htmlContent, url);
    metadata = {
      ...metadata,
      ...extractedAssets.metadata,
      sizeBytes: Buffer.byteLength(htmlContent, 'utf8'),
      sha256: crypto.createHash('sha256').update(htmlContent).digest('hex'),
      mimeType: 'text/html'
    };
    discoveredAssets = extractedAssets.discoveredAssets;

    if (metadata.title) {
      sourceTitle = `${metadata.title} (${url})`;
    }

    rawText = cleanHtml(htmlContent);
  } 
  else if (inputType === 'PHOTO' || inputType === 'IMAGE' || inputType === 'VIDEO') {
    const mediaTitle = file ? file.originalname : (url || 'Submitted Media');
    sourceTitle = `${inputType === 'VIDEO' ? 'Video' : 'Photo'} Verification: ${mediaTitle}`;

    const mediaAnalysis = await processMediaAnalysis({ inputType, text, url, file });

    const contextParts = [
      (text || '').trim(),
      mediaAnalysis.ocrText ? `OCR Text: ${mediaAnalysis.ocrText}` : '',
      mediaAnalysis.visualDescription ? `Visual Description: ${mediaAnalysis.visualDescription}` : '',
      mediaAnalysis.transcript ? `Transcript: ${mediaAnalysis.transcript}` : ''
    ].filter(Boolean);

    rawText = contextParts.join('\n\n');
    if (!rawText || countWords(rawText) < 5) {
      rawText = `Media verification payload for ${mediaTitle}. ${text ? 'User notes: ' + text : ''}`;
    }

    return {
      sourceTitle,
      rawText: cleanExtractedText(rawText),
      extractedText: cleanExtractedText(rawText),
      wordCount: countWords(rawText),
      characterCount: rawText.length,
      mediaAnalysis,
      metadata: {
        ...metadata,
        mimeType: file?.mimetype || (inputType === 'VIDEO' ? 'video/mp4' : 'image/jpeg'),
        sizeBytes: file?.size || 0,
        sha256: mediaAnalysis.file?.sha256 || null
      },
      discoveredAssets,
      truncated: false,
      extractedAt: new Date().toISOString()
    };
  } else {
    const err = new Error('Invalid input type specified. Must be URL, FILE, TEXT, PHOTO, or VIDEO.');
    err.status = 400;
    throw err;
  }

  // Clean rawText first so all downstream processing receives pure prose
  const cleanedText = cleanExtractedText(rawText);

  // 2. Validate Word Count Minimum
  const wordCount = countWords(cleanedText);
  if (wordCount < MIN_WORD_COUNT) {
    const err = new Error('Pasted text is too short. A minimum of 15 words is required for accurate fact-checking.');
    err.status = 400;
    throw err;
  }

  // 3. Handle Content Truncation cleanly at sentence boundaries
  let processedText = cleanedText;
  let isTruncated = false;

  if (cleanedText.length > MAX_CHAR_LIMIT) {
    let truncatedCut = cleanedText.substring(0, MAX_CHAR_LIMIT);
    const lastSentenceEnd = Math.max(
      truncatedCut.lastIndexOf('. '),
      truncatedCut.lastIndexOf('? '),
      truncatedCut.lastIndexOf('! ')
    );
    if (lastSentenceEnd > MAX_CHAR_LIMIT * 0.8) {
      truncatedCut = truncatedCut.substring(0, lastSentenceEnd + 1);
    }
    processedText = truncatedCut;
    isTruncated = true;
  }

  return {
    rawText,
    extractedText: processedText,
    sourceTitle,
    wordCount,
    truncated: isTruncated,
    characterCount: processedText.length,
    metadata,
    discoveredAssets,
    unifiedAsset: {
      inputType,
      sourceTitle,
      wordCount,
      characterCount: processedText.length,
      truncated: isTruncated,
      metadata,
      discoveredAssets
    }
  };
}

async function fetchArticleFromUrl(url) {
  const result = await processInputContent({ inputType: 'URL', url });
  return {
    headline: result.sourceTitle,
    text: result.extractedText,
    metadata: result.metadata,
    discoveredAssets: result.discoveredAssets
  };
}

module.exports = {
  processInputContent,
  fetchArticleFromUrl,
  countWords,
  cleanHtml,
  cleanExtractedText,
  extractHtmlAssetsAndMetadata
};
