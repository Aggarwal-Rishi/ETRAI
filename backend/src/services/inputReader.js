const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fetch = require('node-fetch');
const path = require('path');

const MIN_WORD_COUNT = 35;
const MAX_CHAR_LIMIT = 48000; // ~12,000 tokens

/**
 * Counts words in a string
 */
function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strips HTML tags, scripts, and styles to get clean text
 */
function cleanHtml(html) {
  if (!html) return '';
  // Remove script and style elements
  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Replace HTML tags with space
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities basic
  clean = clean
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize whitespace
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Main Content Reader Service (Agent 1)
 */
async function processInputContent({ inputType, text, url, file }) {
  let rawText = '';
  let sourceTitle = '';

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
  } 
  else if (inputType === 'FILE') {
    if (!file || !file.buffer) {
      const err = new Error('File upload payload missing or invalid.');
      err.status = 400;
      throw err;
    }

    const filename = file.originalname || 'Uploaded Document';
    sourceTitle = `File: ${filename}`;
    const ext = path.extname(filename).toLowerCase();

    try {
      if (ext === '.pdf' || file.mimetype === 'application/pdf') {
        const parsed = await pdfParse(file.buffer);
        rawText = parsed.text;
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

    sourceTitle = `URL: ${url}`;
    
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
        // Attempt cached fallback
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        const cacheResp = await fetch(cacheUrl, { headers, timeout: 8000 });
        if (cacheResp.ok) {
          htmlContent = await cacheResp.text();
        }
      }
    } catch (e) {
      // Catch network timeout or fetch error
    }

    if (!htmlContent) {
      const err = new Error('Unable to extract content from the provided URL. The page may be paywalled, blocked, or offline.');
      err.status = 422;
      throw err;
    }

    rawText = cleanHtml(htmlContent);
  } else {
    const err = new Error('Invalid input type specified. Must be URL, FILE, or TEXT.');
    err.status = 400;
    throw err;
  }

  // 2. Validate Word Count Minimum
  const wordCount = countWords(rawText);
  if (wordCount < MIN_WORD_COUNT) {
    const err = new Error('Pasted text is too short. A minimum of 35 words is required for accurate fact-checking.');
    err.status = 400;
    throw err;
  }

  // 3. Handle Content Truncation if text exceeds token limits
  let processedText = rawText;
  let isTruncated = false;

  if (rawText.length > MAX_CHAR_LIMIT) {
    processedText = rawText.substring(0, MAX_CHAR_LIMIT);
    isTruncated = true;
  }

  return {
    rawText,
    extractedText: processedText,
    sourceTitle,
    wordCount,
    truncated: isTruncated,
    characterCount: processedText.length
  };
}

module.exports = {
  processInputContent,
  countWords,
  cleanHtml
};
