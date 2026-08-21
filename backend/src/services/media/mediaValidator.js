const crypto = require('crypto');
const path = require('path');

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB dedicated image limit
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB dedicated video limit

const SUPPORTED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const SUPPORTED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']);

/**
 * Inspects binary buffer magic-bytes to verify authentic image/video format
 */
function detectFormatFromMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // WEBP: RIFF ... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  // GIF: GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }

  // WEBM: 1A 45 DF A3 (EBML Header)
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return 'video/webm';
  }

  // MP4 / MOV container atoms check at offset 4-7 ('ftyp', 'moov', 'mdat', 'free', 'wide')
  if (buffer.length >= 8) {
    const atomType = buffer.toString('ascii', 4, 8);
    if (atomType === 'ftyp' || atomType === 'moov' || atomType === 'mdat' || atomType === 'free' || atomType === 'wide') {
      const subBrand = buffer.length >= 12 ? buffer.toString('ascii', 8, 12) : '';
      if (subBrand.includes('qt') || atomType === 'moov') {
        return 'video/quicktime';
      }
      return 'video/mp4';
    }
  }

  return null;
}

/**
 * Validates media buffer/URL, inspects magic-bytes, checks size limits, and computes SHA-256 hash.
 */
function validateMediaInput({ file, url, inputType }) {
  const limitations = [];

  let mediaType = (inputType || '').toUpperCase();
  if (mediaType === 'IMAGE' || mediaType === 'PHOTO') mediaType = 'PHOTO';
  if (mediaType === 'VIDEO') mediaType = 'VIDEO';

  let filename = file ? file.originalname : (url ? path.basename(new URL(url).pathname) : 'unknown_media');
  if (!filename || filename === '/' || filename === '.') filename = 'media_payload';

  let mimeType = file ? file.mimetype : 'application/octet-stream';
  if (url && (url.includes('.mp4') || url.includes('.mov') || url.includes('.webm'))) {
    mediaType = 'VIDEO';
  }

  if (file && file.buffer) {
    const sizeBytes = file.buffer.length;

    // 1. Enforce dedicated 20MB limit for photos
    if (sizeBytes > MAX_IMAGE_SIZE_BYTES && mediaType === 'PHOTO') {
      return {
        valid: false,
        error: `Image filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 20MB limit.`,
        mediaType,
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }

    // 2. Enforce dedicated 50MB limit for videos
    if (sizeBytes > MAX_VIDEO_SIZE_BYTES && mediaType === 'VIDEO') {
      return {
        valid: false,
        error: `Video filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 50MB limit.`,
        mediaType,
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }

    // 3. Validate magic-bytes for image & video uploads
    const detectedMime = detectFormatFromMagicBytes(file.buffer);

    if (mediaType === 'PHOTO' || mimeType.startsWith('image/')) {
      if (!detectedMime || !detectedMime.startsWith('image/')) {
        return {
          valid: false,
          error: `Malformed or unsupported image file. Magic-byte signature verification failed for '${filename}'.`,
          mediaType: 'PHOTO',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File extension or metadata did not match valid JPEG/PNG/WEBP magic-byte signature']
        };
      }
      mimeType = detectedMime;
    } else if (mediaType === 'VIDEO' || mimeType.startsWith('video/')) {
      mediaType = 'VIDEO';
      if (!detectedMime || !detectedMime.startsWith('video/')) {
        return {
          valid: false,
          error: `Malformed or unsupported video file. Magic-byte signature verification failed for '${filename}'.`,
          mediaType: 'VIDEO',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File extension or metadata did not match valid MP4/MOV/WEBM magic-byte signature']
        };
      }
      mimeType = detectedMime;
    }
  }

  const sizeBytes = file ? file.buffer.length : 0;
  let sha256 = '';

  if (file && file.buffer) {
    sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  } else if (url) {
    sha256 = crypto.createHash('sha256').update(url).digest('hex');
    limitations.push('Remote URL media: Hash computed from URL string without full binary download');
  }

  return {
    valid: true,
    mediaType: mediaType || 'PHOTO',
    fileInfo: {
      filename,
      mimeType,
      sizeBytes,
      sha256
    },
    limitations
  };
}

module.exports = {
  validateMediaInput,
  detectFormatFromMagicBytes
};
