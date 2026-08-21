const fetch = require('node-fetch');
const { getProviderStatus } = require('../providerManager');
const { isSsrfSafeUrl } = require('../ssrfGuard');

/**
 * Reverse Image Search Service
 * Queries Serper / Google Lens / Reverse Search Provider when configured.
 * Returns { status: "UNAVAILABLE", matches: [] } when unconfigured. NEVER fabricates fake matches.
 */
async function performReverseImageSearch(fileInfo, buffer = null, imageUrl = null, options = {}) {
  // Option A: Explicit mock provider injected for unit testing
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
  const hasSerper = providerStatus.webSearch === 'AVAILABLE' && serperKey && !serperKey.includes('your_serper_api_key');

  if (!hasSerper) {
    return {
      status: 'UNAVAILABLE',
      matches: [],
      limitations: ['Reverse image search provider unavailable (missing Serper / Google Lens API key)']
    };
  }

  // If image URL is provided and SSRF safe, query Serper image search API
  if (imageUrl && isSsrfSafeUrl(imageUrl).safe) {
    try {
      const res = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: imageUrl, num: 5 }),
        timeout: 6000
      });

      if (res.ok) {
        const data = await res.json();
        const matches = (data.images || []).map(item => ({
          title: item.title || '',
          sourceUrl: item.link || item.imageUrl || '',
          domain: new URL(item.link || item.imageUrl).hostname.replace(/^www\./, ''),
          thumbnailUrl: item.thumbnailUrl || ''
        }));

        return {
          status: 'AVAILABLE',
          matches,
          limitations: matches.length === 0 ? ['No matching visual index hits returned from search index'] : []
        };
      }
    } catch (e) {
      return {
        status: 'ERROR',
        matches: [],
        limitations: [`Reverse image search API error: ${e.message}`]
      };
    }
  }

  return {
    status: 'UNAVAILABLE',
    matches: [],
    limitations: ['Direct binary image buffer reverse search requires external image hosting or Google Lens API integration']
  };
}

module.exports = {
  performReverseImageSearch
};
