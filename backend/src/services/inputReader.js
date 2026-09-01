const mammoth = require('mammoth');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');
const { processMediaAnalysis } = require('./media/mediaOrchestrator');
const { fetchRemoteMediaBuffer, fetchRemoteText } = require('./media/remoteMediaFetcher');
const { isSsrfSafeUrl } = require('./ssrfGuard');

const MIN_WORD_COUNT = 1;
const MAX_CHAR_LIMIT = 48000; // ~12,000 tokens
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

let pdfModule = null;
function getPdfParser() {
  if (!pdfModule) {
    try {
      pdfModule = require('pdf-parse');
    } catch (e) {
      console.warn('[PDF Parser Warning]:', e.message);
    }
  }
  return pdfModule;
}

async function parsePdfBuffer(buffer) {
  const mod = getPdfParser();
  if (!mod) {
    throw new Error('PDF parsing library is unavailable.');
  }

  // 1. Standard pdf-parse v1 (function export)
  if (typeof mod === 'function') {
    const data = await mod(buffer);
    return {
      text: data.text || '',
      numpages: data.numpages || null
    };
  }

  // 2. pdf-parse v2 (PDFParse class export)
  const ParserClass = mod.PDFParse || mod.default?.PDFParse || mod;
  if (typeof ParserClass === 'function' && ParserClass.prototype) {
    const parser = new ParserClass({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        text: result.text || '',
        numpages: result.total || result.pages?.length || null
      };
    } finally {
      if (parser.destroy) await parser.destroy();
    }
  }

  throw new Error('Unsupported PDF parser interface.');
}

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

function parseIso8601DurationSeconds(value) {
  const match = String(value || '').trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return null;
  const seconds = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
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
  let videoDurationSeconds = null;
  let videoTranscript = null;
  let videoContentUrl = null;
  let videoEmbedUrl = null;

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

  // Structured VideoObject data can expose the full recording duration and
  // a publisher-supplied transcript without downloading the source video.
  const jsonLdScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const scriptTag of jsonLdScripts) {
    try {
      const parsed = JSON.parse(scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, ''));
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const object = queue.shift();
        if (!object || typeof object !== 'object') continue;
        if (Array.isArray(object['@graph'])) queue.push(...object['@graph']);
        const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
        if (!types.some(type => String(type || '').toLowerCase() === 'videoobject')) continue;
        videoDurationSeconds = videoDurationSeconds || parseIso8601DurationSeconds(object.duration);
        videoTranscript = videoTranscript || (typeof object.transcript === 'string' ? decodeHtmlEntities(object.transcript).replace(/\s+/g, ' ').trim().slice(0, 24000) : null);
        videoContentUrl = videoContentUrl || object.contentUrl || null;
        videoEmbedUrl = videoEmbedUrl || object.embedUrl || null;
        title = title || object.name || object.headline || null;
        description = description || object.description || null;
        canonicalUrl = canonicalUrl || object.url || null;
        publisher = publisher || object.publisher?.name || (typeof object.publisher === 'string' ? object.publisher : null);
        if (!publishedAt && (object.uploadDate || object.datePublished)) {
          const date = new Date(object.uploadDate || object.datePublished);
          if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString();
        }
      }
    } catch (_) {}
  }
  if (!videoDurationSeconds) {
    const durationMeta = html.match(/<meta[^>]+property=["']video:duration["'][^>]+content=["']([^"']+)["']/i);
    const numericDuration = durationMeta ? Number(durationMeta[1]) : 0;
    if (Number.isFinite(numericDuration) && numericDuration > 0) videoDurationSeconds = numericDuration;
  }

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
      favicon,
      videoDurationSeconds,
      videoTranscript,
      videoContentUrl,
      videoEmbedUrl
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
 * Extracts metadata, captions, OpenGraph tags, and context for video URLs (Instagram, YouTube, TikTok, Vimeo, web video)
 */
async function extractVideoUrlContent(videoUrl, userNotes = '') {
  const isYouTubeUrl = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.test(videoUrl);
  const isInstagram = /instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i.test(videoUrl);
  const isTikTok = /tiktok\.com\/@[^/]+\/video\/(\d+)/i.test(videoUrl);
  const isVimeo = /vimeo\.com\/(\d+)/i.test(videoUrl);

  let provider = 'web_video';
  if (isYouTubeUrl) provider = 'youtube';
  else if (isInstagram) provider = 'instagram';
  else if (isTikTok) provider = 'tiktok';
  else if (isVimeo) provider = 'vimeo';

  let title = `${provider.toUpperCase()} Video Broadcast: ${videoUrl}`;
  let description = '';
  let extractedText = '';
  let mediaThumb = null;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch(videoUrl, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const html = await resp.text();
      const meta = extractHtmlAssetsAndMetadata(html, videoUrl);
      if (meta.metadata.title) title = meta.metadata.title;
      if (meta.metadata.description) description = meta.metadata.description;
      if (meta.discoveredAssets?.images?.[0]?.url) mediaThumb = meta.discoveredAssets.images[0].url;
      const cleanBody = cleanHtml(html);
      if (cleanBody && cleanBody.length > 30) extractedText = cleanBody;
    }
  } catch (e) {
    clearTimeout(timeoutId);
  }

  // Combine title, description, and user notes
  const contentParts = [
    title !== videoUrl ? title : '',
    description,
    extractedText && extractedText !== description && extractedText.length < 3000 ? extractedText : '',
    userNotes ? `User Provided Video Context: ${userNotes}` : ''
  ].filter(Boolean);

  let fullText = contentParts.join('\n\n').trim();
  if (!fullText || countWords(fullText) < 2) {
    fullText = `Video stream verification payload for ${videoUrl}. ${userNotes ? 'User notes: ' + userNotes : ''}`;
  }

  return {
    provider,
    title,
    description,
    fullText,
    thumbnailUrl: mediaThumb
  };
}

/**
 * Unified Multi-Modal Input Processor (Agent 1)
 * Handles URLs, Files (PDF/DOCX/TXT), Raw Text, and Media with truthful metadata extraction.
 */
async function processInputContent({ inputType, text, url, file }, options = {}) {
  let rawText = '';
  let sourceTitle = '';
  // Preserve the complete media result for the verification pipeline and report UI.
  // Previously only a few fields were copied into metadata, which caused image/video
  // reports to fall back to fabricated placeholder values and disabled comparison UI.
  let mediaAnalysis = null;
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
        const parsed = await parsePdfBuffer(file.buffer);
        rawText = parsed.text || '';
        metadata.pageCount = parsed.numpages || null;
        const docForensics = await processMediaAnalysis({ inputType: 'PDF', file, text: rawText }, options);
        mediaAnalysis = docForensics;
        metadata.documentForensics = docForensics.docForensics;
        metadata.forensicEvidence = docForensics.forensicEvidence || [];
        metadata.forensicVerdict = docForensics.forensicVerdict;
      } else if (
        ext === '.docx' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const parsed = await mammoth.extractRawText({ buffer: file.buffer });
        rawText = parsed.value || '';
        const docForensics = await processMediaAnalysis({ inputType: 'DOCX', file, text: rawText }, options);
        mediaAnalysis = docForensics;
        metadata.documentForensics = docForensics.docForensics;
        metadata.forensicEvidence = docForensics.forensicEvidence || [];
        metadata.forensicVerdict = docForensics.forensicVerdict;
      } else if (ext === '.txt' || file.mimetype === 'text/plain') {
        rawText = file.buffer.toString('utf-8');
      } else {
        const err = new Error('Unsupported document format. Accepted document formats are PDF (.pdf), Word (.docx), and Plain Text (.txt).');
        err.status = 400;
        throw err;
      }
    } catch (parseError) {
      if (parseError.status) throw parseError;
      const err = new Error(`Failed to parse file content: ${parseError.message}`);
      err.status = 400;
      throw err;
    }
  } 
  else if (inputType === 'PHOTO' || inputType === 'IMAGE') {
    if (file && file.buffer) {
      const filename = file.originalname || 'Uploaded Image';
      sourceTitle = `Photo: ${filename}`;
      metadata.mimeType = file.mimetype || 'image/jpeg';
      metadata.sizeBytes = file.buffer.length;
      metadata.sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const imgMedia = await processMediaAnalysis({ inputType: 'IMAGE', file, url, text }, options);
      mediaAnalysis = imgMedia;
      rawText = imgMedia.ocrText || imgMedia.visualDescription || (text ? text.trim() : `Image file: ${filename}`);
      metadata.imageForensics = imgMedia.imageForensics;
      metadata.forensicEvidence = imgMedia.forensicEvidence || [];
      metadata.forensicVerdict = imgMedia.forensicVerdict;
    } else if (url && typeof url === 'string') {
      const ssrfCheck = isSsrfSafeUrl(url);
      if (!ssrfCheck.safe) {
        const err = new Error(`Invalid or restricted URL: ${ssrfCheck.reason}`);
        err.status = 400;
        throw err;
      }
      const remote = await fetchRemoteMediaBuffer(url, { expectedKind: 'image' });
      const remoteFile = {
        originalname: remote.filename,
        mimetype: remote.mimeType,
        buffer: remote.buffer,
        size: remote.sizeBytes
      };
      sourceTitle = `Image URL: ${url}`;
      discoveredAssets.images.push({ url: remote.finalUrl, alt: 'Submitted image asset', isLead: true });
      metadata.mimeType = remote.mimeType;
      metadata.sizeBytes = remote.sizeBytes;
      metadata.sha256 = crypto.createHash('sha256').update(remote.buffer).digest('hex');
      const imgMedia = await processMediaAnalysis({ inputType: 'IMAGE', file: remoteFile, url: remote.finalUrl, text }, options);
      mediaAnalysis = imgMedia;
      rawText = imgMedia.ocrText || imgMedia.visualDescription || (text ? text.trim() : `Image asset verification for URL: ${remote.finalUrl}`);
      metadata.imageForensics = imgMedia.imageForensics;
      metadata.forensicEvidence = imgMedia.forensicEvidence || [];
      metadata.forensicVerdict = imgMedia.forensicVerdict;
    } else {
      const err = new Error('An image file or valid image URL is required.');
      err.status = 400;
      throw err;
    }
  }
  else if (inputType === 'VIDEO') {
    if (file && file.buffer) {
      const filename = file.originalname || 'Uploaded Video';
      sourceTitle = `Video: ${filename}`;
      metadata.mimeType = file.mimetype || 'video/mp4';
      metadata.sizeBytes = file.buffer.length;
      metadata.sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const vidMedia = await processMediaAnalysis({ inputType: 'VIDEO', file, text }, options);
      mediaAnalysis = vidMedia;
      rawText = vidMedia.transcript || vidMedia.visualDescription || (text ? text.trim() : `Video file: ${filename}`);
      metadata.videoAudioForensics = vidMedia.videoAudioForensics;
      metadata.forensicEvidence = vidMedia.forensicEvidence || [];
      metadata.forensicVerdict = vidMedia.forensicVerdict;
    } else if (url && typeof url === 'string') {
      const ssrfCheck = isSsrfSafeUrl(url);
      if (!ssrfCheck.safe) {
        const err = new Error(`Invalid or restricted URL: ${ssrfCheck.reason}`);
        err.status = 400;
        throw err;
      }

      const isPlatformPage = /(?:youtube\.com|youtu\.be|vimeo\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)\//i.test(url);
      const isDirectVideo = !isPlatformPage;
      if (isDirectVideo) {
        const remote = await fetchRemoteMediaBuffer(url, { expectedKind: 'video' });
        const remoteFile = {
          originalname: remote.filename,
          mimetype: remote.mimeType,
          buffer: remote.buffer,
          size: remote.sizeBytes
        };
        const vidMedia = await processMediaAnalysis({ inputType: 'VIDEO', file: remoteFile, url: remote.finalUrl, text }, options);
        mediaAnalysis = vidMedia;
        sourceTitle = `Video URL: ${url}`;
        rawText = vidMedia.transcript || vidMedia.visualDescription || (text ? text.trim() : `Video asset verification for URL: ${remote.finalUrl}`);
        discoveredAssets.videos.push({ url: remote.finalUrl, provider: 'direct', title: sourceTitle, thumbnail: null });
        metadata.mimeType = remote.mimeType;
        metadata.sizeBytes = remote.sizeBytes;
        metadata.sha256 = crypto.createHash('sha256').update(remote.buffer).digest('hex');
        metadata.videoAudioForensics = vidMedia.videoAudioForensics;
        metadata.forensicEvidence = vidMedia.forensicEvidence || [];
        metadata.forensicVerdict = vidMedia.forensicVerdict;
        metadata.videoUrl = remote.finalUrl;
        metadata.videoProvider = 'direct';
      } else {
      const videoUrlInfo = await extractVideoUrlContent(url, text);
      sourceTitle = videoUrlInfo.title;
      rawText = videoUrlInfo.fullText;
      discoveredAssets.videos.push({
        url,
        provider: videoUrlInfo.provider,
        title: videoUrlInfo.title,
        thumbnail: videoUrlInfo.thumbnailUrl
      });
      if (videoUrlInfo.thumbnailUrl) {
        discoveredAssets.images.push({
          url: videoUrlInfo.thumbnailUrl,
          alt: videoUrlInfo.title,
          isLead: true
        });
      }
      metadata.videoUrl = url;
      metadata.videoProvider = videoUrlInfo.provider;
      metadata.mimeType = 'video/mp4';
      metadata.videoForensicsStatus = 'UNAVAILABLE_REMOTE_PLATFORM_PAGE';
      }
    } else {
      const err = new Error('A video file or valid video URL is required.');
      err.status = 400;
      throw err;
    }
  }
  else if (inputType === 'AUDIO') {
    if (file && file.buffer) {
      const filename = file.originalname || 'Uploaded Audio';
      sourceTitle = `Audio: ${filename}`;
      metadata.mimeType = file.mimetype || 'audio/mpeg';
      metadata.sizeBytes = file.buffer.length;
      metadata.sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const audMedia = await processMediaAnalysis({ inputType: 'AUDIO', file, text }, options);
      mediaAnalysis = audMedia;
      rawText = audMedia.transcript || (text ? text.trim() : `Audio file: ${filename}`);
      metadata.videoAudioForensics = audMedia.videoAudioForensics;
      metadata.forensicEvidence = audMedia.forensicEvidence || [];
      metadata.forensicVerdict = audMedia.forensicVerdict;
    } else {
      const err = new Error('An audio file upload is required.');
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
    try {
      const remotePage = await fetchRemoteText(url);
      htmlContent = remotePage.text;
      url = remotePage.finalUrl;
    } catch (error) {
      const err = new Error(`Unable to extract content from the provided URL: ${error.message}`);
      err.status = 422;
      throw err;
    }

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
    const err = new Error('Input text is empty. Please enter or upload content to verify.');
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
    mediaAnalysis,
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
