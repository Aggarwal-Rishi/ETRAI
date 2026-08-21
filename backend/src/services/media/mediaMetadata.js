/**
 * Extracts metadata (dimensions, format, EXIF/container headers) for photo and video files.
 * IMPORTANT RULE: Missing EXIF data must NEVER be treated as proof of manipulation.
 */
function extractMediaMetadata(fileInfo, buffer = null, mockMetadata = null) {
  const isVideo = (fileInfo.mimeType || '').startsWith('video/');

  const metadata = {
    filename: fileInfo.filename,
    mimeType: fileInfo.mimeType,
    sizeBytes: fileInfo.sizeBytes,
    sha256: fileInfo.sha256,
    format: (fileInfo.mimeType || '').split('/')[1] || 'unknown',
    width: null,
    height: null,
    durationSeconds: null,
    fps: null,
    codec: null,
    bitrateKbps: null,
    hasAudio: false,
    audioCodec: null,
    creationDate: null,
    hasExif: false,
    exif: {
      make: null,
      model: null,
      timestamp: null,
      gps: null,
      software: null,
      orientation: null
    }
  };

  const limitations = [];

  // If mock metadata is passed directly in options/tests
  if (mockMetadata && typeof mockMetadata === 'object') {
    if (mockMetadata.exif) {
      metadata.hasExif = true;
      metadata.exif = { ...metadata.exif, ...mockMetadata.exif };
    }
    if (mockMetadata.make || mockMetadata.model) {
      metadata.hasExif = true;
      metadata.exif.make = mockMetadata.make || null;
      metadata.exif.model = mockMetadata.model || null;
      metadata.exif.timestamp = mockMetadata.timestamp || null;
      metadata.exif.gps = mockMetadata.gps || null;
      metadata.exif.software = mockMetadata.software || null;
    }
    if (mockMetadata.durationSeconds !== undefined) metadata.durationSeconds = mockMetadata.durationSeconds;
    if (mockMetadata.width !== undefined) metadata.width = mockMetadata.width;
    if (mockMetadata.height !== undefined) metadata.height = mockMetadata.height;
    if (mockMetadata.fps !== undefined) metadata.fps = mockMetadata.fps;
    if (mockMetadata.codec !== undefined) metadata.codec = mockMetadata.codec;
    if (mockMetadata.bitrateKbps !== undefined) metadata.bitrateKbps = mockMetadata.bitrateKbps;
    if (mockMetadata.hasAudio !== undefined) metadata.hasAudio = mockMetadata.hasAudio;
    if (mockMetadata.audioCodec !== undefined) metadata.audioCodec = mockMetadata.audioCodec;
    if (mockMetadata.creationDate !== undefined) metadata.creationDate = mockMetadata.creationDate;
  }

  // Parse binary buffer header if buffer is supplied
  if (buffer && Buffer.isBuffer(buffer)) {
    try {
      if (fileInfo.mimeType === 'image/png' && buffer.length > 24) {
        metadata.width = buffer.readUInt32BE(16);
        metadata.height = buffer.readUInt32BE(20);
      } else if (fileInfo.mimeType === 'image/jpeg' && buffer.length > 4) {
        let offset = 2;
        while (offset < buffer.length - 8) {
          const marker = buffer.readUInt16BE(offset);
          if (marker === 0xFFE1 && !metadata.hasExif) {
            metadata.hasExif = true;
          }
          const len = buffer.readUInt16BE(offset + 2);
          if (marker === 0xFFC0 || marker === 0xFFC1 || marker === 0xFFC2) {
            metadata.height = buffer.readUInt16BE(offset + 5);
            metadata.width = buffer.readUInt16BE(offset + 7);
            break;
          }
          offset += 2 + len;
        }
      } else if (fileInfo.mimeType === 'image/webp' && buffer.length >= 30) {
        const chunkType = buffer.toString('ascii', 12, 16);
        if (chunkType === 'VP8X' && buffer.length >= 30) {
          metadata.width = 1 + (buffer[20] | (buffer[21] << 8) | (buffer[22] << 16));
          metadata.height = 1 + (buffer[23] | (buffer[24] << 8) | (buffer[25] << 16));
        }
      } else if (isVideo && buffer.length >= 100) {
        // Parse MP4/MOV container headers (mvhd / tkhd) if available in buffer
        const bufStr = buffer.toString('binary');
        const mvhdIdx = bufStr.indexOf('mvhd');
        if (mvhdIdx !== -1 && buffer.length >= mvhdIdx + 32) {
          const timescale = buffer.readUInt32BE(mvhdIdx + 16);
          const durationTicks = buffer.readUInt32BE(mvhdIdx + 20);
          if (timescale > 0) {
            metadata.durationSeconds = Number((durationTicks / timescale).toFixed(2));
          }
        }
        const tkhdIdx = bufStr.indexOf('tkhd');
        if (tkhdIdx !== -1 && buffer.length >= tkhdIdx + 84) {
          metadata.width = Math.round(buffer.readUInt32BE(tkhdIdx + 76) / 65536) || null;
          metadata.height = Math.round(buffer.readUInt32BE(tkhdIdx + 80) / 65536) || null;
        }
        if (bufStr.includes('mp4a') || bufStr.includes('opus') || bufStr.includes('vorbis') || bufStr.includes('aac')) {
          metadata.hasAudio = true;
          metadata.audioCodec = bufStr.includes('mp4a') || bufStr.includes('aac') ? 'aac' : (bufStr.includes('opus') ? 'opus' : 'vorbis');
        }
        if (bufStr.includes('avc1')) metadata.codec = 'h264';
        else if (bufStr.includes('hvc1') || bufStr.includes('hev1')) metadata.codec = 'h265';
        else if (bufStr.includes('vp09')) metadata.codec = 'vp9';
        else if (bufStr.includes('vp08')) metadata.codec = 'vp8';

        if (fileInfo.sizeBytes > 0 && metadata.durationSeconds > 0) {
          metadata.bitrateKbps = Math.round((fileInfo.sizeBytes * 8 / 1024) / metadata.durationSeconds);
        }
      }
    } catch (e) {
      limitations.push('Failed to parse binary media header tags');
    }
  }

  if (!isVideo && !metadata.hasExif) {
    limitations.push('EXIF metadata not present in image file (Note: missing EXIF is common in web images and is NOT proof of manipulation)');
  }

  if (metadata.width === null || metadata.height === null) {
    limitations.push('Dimensions metadata unextracted or unavailable without dedicated video decoder (FFprobe/FFmpeg)');
  }

  return {
    metadata,
    limitations
  };
}

module.exports = {
  extractMediaMetadata
};
