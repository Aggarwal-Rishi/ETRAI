const crypto = require('crypto');
const path = require('path');

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_DOC_SIZE_BYTES = 50 * 1024 * 1024;   // 50MB (PDF/DOCX)
const MAX_AUDIO_SIZE_BYTES = 30 * 1024 * 1024; // 30MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // aligned with upload middleware and UI
const MAX_UNCOMPRESSED_ZIP_BYTES = 100 * 1024 * 1024; // 100MB decompression bomb guard

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/webm'
]);

/**
 * Inspects binary buffer magic-bytes to verify authentic media / document format
 */
function detectFormatFromMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // 3. GIF: GIF87a / GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // 4. WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // 5. TIFF: II*. / MM.*
  if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
      (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)) {
    return 'image/tiff';
  }

  // 6. PDF: %PDF- (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // 7. DOCX / ZIP: PK.. (50 4B 03 04 or 50 4B 05 06)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
    // Check if zip contains word/ structure
    const bufStr = buffer.toString('binary', 0, Math.min(buffer.length, 4096));
    if (bufStr.includes('word/') || bufStr.includes('[Content_Types].xml')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return 'application/zip';
  }

  // 8. WAV: RIFF .... WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
  ) {
    return 'audio/wav';
  }

  // 9. MP3: ID3 or FF FB / FF F3 / FF F2
  if ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
      (buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xF3 || buffer[1] === 0xF2))) {
    return 'audio/mpeg';
  }

  // 10. WEBM / MKV: 1A 45 DF A3 (EBML Header)
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    const headerStr = buffer.toString('binary', 0, Math.min(buffer.length, 256));
    if (headerStr.includes('webm')) return 'video/webm';
    return 'video/webm';
  }

  // 11. MP4 / MOV / M4A: atom check at offset 4-7 ('ftyp', 'moov', 'mdat')
  if (buffer.length >= 8) {
    const atomType = buffer.toString('ascii', 4, 8);
    if (atomType === 'ftyp' || atomType === 'moov' || atomType === 'mdat' || atomType === 'free' || atomType === 'wide') {
      const subBrand = buffer.length >= 12 ? buffer.toString('ascii', 8, 12) : '';
      if (subBrand.includes('M4A') || subBrand.includes('m4a')) {
        return 'audio/mp4';
      }
      if (subBrand.includes('qt')) {
        return 'video/quicktime';
      }
      return 'video/mp4';
    }
  }

  return null;
}

/**
 * Sanitizes input filenames to protect against directory traversal and control characters
 */
function sanitizeFilename(rawName = '') {
  if (!rawName || typeof rawName !== 'string') return 'media_payload.bin';
  const base = path.basename(rawName.trim());
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'media_payload.bin';
}

/**
 * Checks for Decompression Bombs / Zip Bombs in archives & DOCX
 */
function inspectZipBombSafety(buffer) {
  if (!buffer || buffer.length < 22) return { isSafe: true };

  // Scan local file headers (0x50 0x4b 0x03 0x04)
  let totalUncompressedSize = 0;
  let offset = 0;
  const len = buffer.length;

  while (offset + 30 <= len) {
    if (buffer[offset] === 0x50 && buffer[offset + 1] === 0x4B && buffer[offset + 2] === 0x03 && buffer[offset + 3] === 0x04) {
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      totalUncompressedSize += uncompressedSize;

      if (totalUncompressedSize > MAX_UNCOMPRESSED_ZIP_BYTES) {
        return {
          isSafe: false,
          error: `Decompression safety violation: Uncompressed archive size exceeds ${MAX_UNCOMPRESSED_ZIP_BYTES / (1024 * 1024)}MB maximum limit.`
        };
      }
      offset += 30 + nameLength + extraLength;
    } else {
      offset++;
    }
  }

  return { isSafe: true, totalUncompressedSize };
}

/**
 * Validates media and document buffer / URL, inspects magic-bytes, checks size limits, and computes SHA-256 hash.
 */
function validateMediaInput({ file, url, inputType, buffer: rawBuffer }) {
  const limitations = [];
  const buffer = file?.buffer || rawBuffer || null;

  let rawType = (inputType || '').toUpperCase();
  let mediaCategory = 'IMAGE';

  if (rawType.includes('PDF')) mediaCategory = 'PDF';
  else if (rawType.includes('DOC') || rawType.includes('WORD')) mediaCategory = 'DOCX';
  else if (rawType.includes('TXT') || rawType.includes('TEXT')) mediaCategory = 'TXT';
  else if (rawType.includes('VIDEO') || rawType.includes('CLIP')) mediaCategory = 'VIDEO';
  else if (rawType.includes('AUDIO') || rawType.includes('VOICE') || rawType.includes('PODCAST')) mediaCategory = 'AUDIO';
  else if (rawType.includes('PHOTO') || rawType.includes('IMAGE')) mediaCategory = 'IMAGE';

  let rawName = file ? file.originalname : (url ? path.basename(new URL(url).pathname) : 'unknown_file');
  const filename = sanitizeFilename(rawName);

  let mimeType = file ? file.mimetype : 'application/octet-stream';

  if (buffer && Buffer.isBuffer(buffer)) {
    const sizeBytes = buffer.length;

    // 1. Enforce specific category size limits
    if (mediaCategory === 'IMAGE' && sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 25MB limit.`,
        mediaType: 'IMAGE',
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }
    if ((mediaCategory === 'PDF' || mediaCategory === 'DOCX') && sizeBytes > MAX_DOC_SIZE_BYTES) {
      return {
        valid: false,
        error: `Document filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 50MB limit.`,
        mediaType: mediaCategory,
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }
    if (mediaCategory === 'AUDIO' && sizeBytes > MAX_AUDIO_SIZE_BYTES) {
      return {
        valid: false,
        error: `Audio filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 30MB limit.`,
        mediaType: 'AUDIO',
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }
    if (mediaCategory === 'VIDEO' && sizeBytes > MAX_VIDEO_SIZE_BYTES) {
      return {
        valid: false,
        error: `Video filesize (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable 50MB limit.`,
        mediaType: 'VIDEO',
        fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
        limitations
      };
    }

    // 2. Validate magic bytes
    const detectedMime = detectFormatFromMagicBytes(buffer);

    if (mediaCategory === 'IMAGE') {
      if (!detectedMime || !detectedMime.startsWith('image/')) {
        return {
          valid: false,
          error: `Malformed or unsupported image file. Magic-byte signature verification failed for '${filename}'.`,
          mediaType: 'IMAGE',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File header does not match valid JPEG, PNG, WEBP, GIF, or TIFF magic-byte signatures']
        };
      }
      mimeType = detectedMime;
    } else if (mediaCategory === 'PDF') {
      if (detectedMime !== 'application/pdf') {
        return {
          valid: false,
          error: `Malformed or invalid PDF. Magic-byte signature '%PDF-' missing in '${filename}'.`,
          mediaType: 'PDF',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File header does not start with valid %PDF- magic-byte signature']
        };
      }
      mimeType = 'application/pdf';
    } else if (mediaCategory === 'DOCX') {
      const zipSafety = inspectZipBombSafety(buffer);
      if (!zipSafety.isSafe) {
        return {
          valid: false,
          error: zipSafety.error,
          mediaType: 'DOCX',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['Document failed zip bomb safety inspection']
        };
      }
      if (detectedMime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && detectedMime !== 'application/zip') {
        return {
          valid: false,
          error: `Malformed or invalid DOCX document. Valid OpenXML package signature missing for '${filename}'.`,
          mediaType: 'DOCX',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File header does not match valid PK zip OpenXML Word document signature']
        };
      }
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (mediaCategory === 'VIDEO') {
      if (!detectedMime || !detectedMime.startsWith('video/')) {
        return {
          valid: false,
          error: `Malformed or unsupported video file. Magic-byte signature verification failed for '${filename}'.`,
          mediaType: 'VIDEO',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File header does not match valid MP4, MOV, or WEBM container atoms']
        };
      }
      mimeType = detectedMime;
    } else if (mediaCategory === 'AUDIO') {
      if (!detectedMime || !detectedMime.startsWith('audio/')) {
        return {
          valid: false,
          error: `Malformed or unsupported audio file. Magic-byte signature verification failed for '${filename}'.`,
          mediaType: 'AUDIO',
          fileInfo: { filename, mimeType, sizeBytes, sha256: '' },
          limitations: ['File header does not match valid WAV, MP3, or M4A audio signatures']
        };
      }
      mimeType = detectedMime;
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      valid: true,
      mediaType: mediaCategory,
      fileInfo: {
        filename,
        mimeType,
        sizeBytes,
        sha256
      },
      limitations
    };
  }

  // URL fallback
  if (url) {
    const sha256 = crypto.createHash('sha256').update(url).digest('hex');
    limitations.push('Remote URL media: Binary hash computed from URL reference string');
    return {
      valid: true,
      mediaType: mediaCategory,
      fileInfo: {
        filename,
        mimeType,
        sizeBytes: 0,
        sha256
      },
      limitations
    };
  }

  return {
    valid: false,
    error: 'No file buffer or valid URL provided for media validation.',
    mediaType: mediaCategory,
    fileInfo: { filename, mimeType, sizeBytes: 0, sha256: '' },
    limitations: ['Missing input payload']
  };
}

module.exports = {
  validateMediaInput,
  detectFormatFromMagicBytes,
  sanitizeFilename,
  inspectZipBombSafety,
  SUPPORTED_MIME_TYPES
};
