const fetch = require('node-fetch');
const { getProviderStatus } = require('../providerManager');
const { isSsrfSafeUrl } = require('../ssrfGuard');

/**
 * Uploads an image buffer to temporary Cloudinary storage for search indexing,
 * then immediately deletes it to ensure zero persistent storage of user media.
 */
async function uploadTemporaryImage(buffer, mimeType = 'image/jpeg') {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const crypto = require('crypto');
    const signatureStr = `timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

    const base64Data = `data:${mimeType};base64,${buffer.toString('base64')}`;

    const formData = new URLSearchParams();
    formData.append('file', base64Data);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'etrai_temp_reverse_search');

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
      timeout: 10000
    });

    if (res.ok) {
      const data = await res.json();
      return {
        url: data.secure_url,
        publicId: data.public_id
      };
    }
  } catch (err) {
    console.error('[Temporary Image Upload Error]:', err.message);
  }
  return null;
}

/**
 * Cleans up temporary image from cloud storage
 */
async function deleteTemporaryImage(publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret || !publicId) return;

  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const crypto = require('crypto');
    const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: 'POST',
      body: formData,
      timeout: 8000
    });
  } catch (err) {
    console.error('[Temporary Image Cleanup Warning]:', err.message);
  }
}

/**
 * Queries Google Cloud Vision API Web Detection directly using base64 image bytes
 */
async function searchGoogleCloudVision(buffer) {
  const visionApiKey = process.env.GOOGLE_VISION_API_KEY || process.env.GOOGLE_API_KEY;
  if (!visionApiKey) return null;

  try {
    const payload = {
      requests: [
        {
          image: {
            content: buffer.toString('base64')
          },
          features: [
            {
              type: 'WEB_DETECTION',
              maxResults: 10
            }
          ]
        }
      ]
    };

    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 10000
    });

    if (res.ok) {
      const data = await res.json();
      const webDetection = data.responses?.[0]?.webDetection;
      if (!webDetection) return { matches: [] };

      const pagesWithMatching = (webDetection.pagesWithMatchingImages || []).map(p => ({
        title: p.pageTitle || 'Matching Web Page',
        sourceUrl: p.url,
        domain: (isSsrfSafeUrl(p.url).safe ? new URL(p.url).hostname.replace(/^www\./, '') : 'external-source'),
        thumbnailUrl: p.fullMatchingImages?.[0]?.url || p.partialMatchingImages?.[0]?.url || ''
      })).filter(item => isSsrfSafeUrl(item.sourceUrl).safe);

      const fullMatching = (webDetection.fullMatchingImages || []).map(img => ({
        title: 'Full Image Match',
        sourceUrl: img.url,
        domain: (isSsrfSafeUrl(img.url).safe ? new URL(img.url).hostname.replace(/^www\./, '') : 'external-source'),
        thumbnailUrl: img.url
      })).filter(item => isSsrfSafeUrl(item.sourceUrl).safe);

      return {
        matches: [...pagesWithMatching, ...fullMatching].slice(0, 8)
      };
    }
  } catch (err) {
    console.error('[Google Vision Web Detection Error]:', err.message);
  }
  return null;
}

/**
 * Reverse Image Search Service
 * Supports both direct uploaded image buffers and public image URLs.
 * Respects strict SSRF validation and NEVER fabricates results.
 */
async function performReverseImageSearch(fileInfo, buffer = null, imageUrl = null, options = {}) {
  // Option 0: Mock provider for testing
  if (options.reverseSearchProvider && typeof options.reverseSearchProvider.search === 'function') {
    try {
      const res = await options.reverseSearchProvider.search(fileInfo, buffer, imageUrl);
      return {
        status: res.status || 'AVAILABLE',
        matches: Array.isArray(res.matches) ? res.matches : [],
        limitations: res.limitations || []
      };
    } catch (e) {
      return {
        status: 'ERROR',
        matches: [],
        limitations: [`Reverse search provider error: ${e.message}`]
      };
    }
  }

  const providerStatus = options.providerStatus || getProviderStatus();
  const serperKey = options.serperKey || process.env.SERPER_API_KEY;
  const hasSerper = serperKey && !serperKey.includes('your_serper_api_key');

  // --------------------------------------------------------------------------
  // PATH 1: Direct Buffer via Google Vision Web Detection (Option B)
  // --------------------------------------------------------------------------
  if (buffer) {
    const visionResults = await searchGoogleCloudVision(buffer);
    if (visionResults) {
      return {
        status: 'AVAILABLE',
        provider: 'GOOGLE_VISION_WEB_DETECTION',
        matches: visionResults.matches,
        limitations: visionResults.matches.length === 0 ? ['No historical web matches identified for this visual asset'] : []
      };
    }
  }

  // --------------------------------------------------------------------------
  // PATH 2: Buffer via Temporary Cloudinary Hosting + Serper (Option A)
  // --------------------------------------------------------------------------
  let temporaryUpload = null;
  let targetSearchUrl = imageUrl;

  if (buffer && !targetSearchUrl) {
    temporaryUpload = await uploadTemporaryImage(buffer, fileInfo?.mimeType || 'image/jpeg');
    if (temporaryUpload) {
      targetSearchUrl = temporaryUpload.url;
    }
  }

  // --------------------------------------------------------------------------
  // PATH 3: Search via Serper Image Search
  // --------------------------------------------------------------------------
  if (targetSearchUrl && hasSerper && isSsrfSafeUrl(targetSearchUrl).safe) {
    try {
      const res = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: targetSearchUrl, num: 6 }),
        timeout: 8000
      });

      // Cleanup temporary upload immediately after query
      if (temporaryUpload?.publicId) {
        deleteTemporaryImage(temporaryUpload.publicId);
      }

      if (res.ok) {
        const data = await res.json();
        const matches = (data.images || [])
          .map(item => {
            const rawUrl = item.link || item.imageUrl || '';
            const isSafe = isSsrfSafeUrl(rawUrl).safe;
            if (!isSafe) return null;
            return {
              title: item.title || 'Indexed Visual Match',
              sourceUrl: rawUrl,
              domain: new URL(rawUrl).hostname.replace(/^www\./, ''),
              thumbnailUrl: item.thumbnailUrl || rawUrl
            };
          })
          .filter(Boolean);

        return {
          status: 'AVAILABLE',
          provider: 'SERPER_IMAGE_INDEX',
          matches,
          limitations: matches.length === 0 ? ['No matching visual index hits returned from search index'] : []
        };
      }
    } catch (e) {
      if (temporaryUpload?.publicId) {
        deleteTemporaryImage(temporaryUpload.publicId);
      }
      return {
        status: 'ERROR',
        matches: [],
        limitations: [`Reverse image search API error: ${e.message}`]
      };
    }
  }

  if (temporaryUpload?.publicId) {
    deleteTemporaryImage(temporaryUpload.publicId);
  }

  // If no credentials configured for uploaded buffer search
  return {
    status: 'UNAVAILABLE',
    matches: [],
    limitations: [
      'Direct image buffer reverse search requires CLOUDINARY_URL (for short-lived temporary indexing) or GOOGLE_VISION_API_KEY'
    ]
  };
}

module.exports = {
  performReverseImageSearch
};
