'use strict';

const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const fetch = require('node-fetch');
const { isSsrfSafeUrl, isPrivateOrRestrictedIp } = require('../ssrfGuard');

async function resolvePublicAddress(url) {
  const safety = isSsrfSafeUrl(url);
  if (!safety.safe) throw new Error(`Restricted remote media URL: ${safety.reason}`);

  const parsed = new URL(url);
  if (net.isIP(parsed.hostname)) {
    if (isPrivateOrRestrictedIp(parsed.hostname)) throw new Error('Remote media URL resolves to a restricted IP address.');
    return { parsed, address: parsed.hostname, family: net.isIP(parsed.hostname) };
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Remote media hostname did not resolve.');
  if (addresses.some(entry => isPrivateOrRestrictedIp(entry.address))) {
    throw new Error('Remote media hostname resolves to a private or restricted network address.');
  }
  return { parsed, ...addresses[0] };
}

function createPinnedAgent(protocol, address, family) {
  const Agent = protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({
    keepAlive: false,
    lookup: (_hostname, lookupOptions, callback) => {
      if (typeof lookupOptions === 'function') {
        callback = lookupOptions;
        lookupOptions = {};
      }
      if (lookupOptions?.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    }
  });
}

function closeResponseBody(response) {
  if (response?.body && typeof response.body.destroy === 'function') {
    response.body.destroy();
  }
}

async function fetchRemoteMediaBuffer(url, options = {}) {
  const expectedKind = options.expectedKind || 'image';
  const maxBytes = options.maxBytes || (expectedKind === 'video' ? 50 * 1024 * 1024 : 25 * 1024 * 1024);
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const { parsed, address, family } = await resolvePublicAddress(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        agent: createPinnedAgent(parsed.protocol, address, family),
        headers: {
          'User-Agent': 'ETRAI-MediaVerifier/2.4',
          Accept: expectedKind === 'video' ? 'video/*' : 'image/*'
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') throw new Error('Remote media download timed out.');
      throw new Error(`Remote media download failed: ${error.message}`);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timeout);
      const location = response.headers.get('location');
      closeResponseBody(response);
      if (!location) throw new Error('Remote media redirect omitted its destination.');
      if (redirectCount === maxRedirects) throw new Error('Remote media exceeded the redirect limit.');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote media server returned HTTP ${response.status}.`);
    }

    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith(`${expectedKind}/`)) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote URL returned '${mimeType || 'unknown'}' instead of ${expectedKind} media.`);
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > maxBytes) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote ${expectedKind} exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
    }

    const chunks = [];
    let receivedBytes = 0;
    try {
      for await (const chunk of response.body) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          controller.abort();
          throw new Error(`Remote ${expectedKind} exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
        }
        chunks.push(chunk);
      }
    } finally {
      clearTimeout(timeout);
    }

    const filename = path.basename(new URL(currentUrl).pathname) || `remote-${expectedKind}`;
    return { buffer: Buffer.concat(chunks), mimeType, filename, finalUrl: currentUrl, sizeBytes: receivedBytes };
  }

  throw new Error('Remote media download could not be completed.');
}

async function fetchRemoteText(url, options = {}) {
  const maxBytes = options.maxBytes || 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const { parsed, address, family } = await resolvePublicAddress(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        agent: createPinnedAgent(parsed.protocol, address, family),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ETRAI-ArticleVerifier/2.4)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9'
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') throw new Error('Remote page download timed out.');
      throw new Error(`Remote page download failed: ${error.message}`);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timeout);
      const location = response.headers.get('location');
      closeResponseBody(response);
      if (!location) throw new Error('Remote page redirect omitted its destination.');
      if (redirectCount === maxRedirects) throw new Error('Remote page exceeded the redirect limit.');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote page returned HTTP ${response.status}.`);
    }

    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowedTypes = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);
    if (mimeType && !allowedTypes.has(mimeType)) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote URL returned unsupported page type '${mimeType}'.`);
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > maxBytes) {
      clearTimeout(timeout);
      closeResponseBody(response);
      throw new Error(`Remote page exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
    }

    const chunks = [];
    let receivedBytes = 0;
    try {
      for await (const chunk of response.body) {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          controller.abort();
          throw new Error(`Remote page exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`);
        }
        chunks.push(chunk);
      }
    } finally {
      clearTimeout(timeout);
    }

    return {
      text: Buffer.concat(chunks).toString('utf8'),
      mimeType: mimeType || 'text/html',
      finalUrl: currentUrl,
      sizeBytes: receivedBytes
    };
  }

  throw new Error('Remote page download could not be completed.');
}

module.exports = { fetchRemoteMediaBuffer, fetchRemoteText, resolvePublicAddress };
