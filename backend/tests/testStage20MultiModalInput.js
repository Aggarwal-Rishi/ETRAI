const assert = require('assert');
const {
  processInputContent,
  extractHtmlAssetsAndMetadata,
  cleanExtractedText,
  countWords
} = require('../src/services/inputReader');

async function runStage20MultiModalInputTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 20: UNIFIED MULTI-MODAL INPUT TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  // ----------------------------------------------------------------
  // Test 1: Pasted Text Ingestion with Checksum & Word Count
  // ----------------------------------------------------------------
  await runTest('1. Pasted text ingestion extracts word count, character count, and sha256 checksum', async () => {
    const text = 'The Union Cabinet chaired by the Prime Minister approved the national semiconductor mission package with comprehensive financial outlay for fabrication ecosystems across major states.';
    
    const res = await processInputContent({
      inputType: 'TEXT',
      text
    });

    assert.strictEqual(res.wordCount, 24);
    assert.strictEqual(res.characterCount, text.length);
    assert.ok(res.metadata.sha256, 'Must generate sha256 hash');
    assert.strictEqual(res.metadata.sha256.length, 64);
    assert.ok(res.unifiedAsset);
    assert.strictEqual(res.unifiedAsset.inputType, 'TEXT');
  });

  // ----------------------------------------------------------------
  // Test 2: File Ingestion (Plain Text & Simulated Document)
  // ----------------------------------------------------------------
  await runTest('2. File ingestion validates MIME type, size limit, and extracts content safely', async () => {
    const content = 'Official policy document confirming the allocation of ₹10,000 Cr towards renewable energy research and grid infrastructure development.';
    const file = {
      originalname: 'policy_doc.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from(content, 'utf-8')
    };

    const res = await processInputContent({
      inputType: 'FILE',
      file
    });

    assert.strictEqual(res.wordCount, 17);
    assert.strictEqual(res.metadata.mimeType, 'text/plain');
    assert.strictEqual(res.metadata.sizeBytes, Buffer.byteLength(content));
    assert.ok(res.metadata.sha256);
  });

  // ----------------------------------------------------------------
  // Test 3: URL HTML Asset & Metadata Extraction
  // ----------------------------------------------------------------
  await runTest('3. HTML extraction discovers images, videos, outbound links, and real meta tags', async () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cabinet Clears Clean Energy Package - National Times</title>
          <meta name="author" content="Aarav Sharma" />
          <meta property="og:site_name" content="National Times" />
          <meta property="article:published_time" content="2026-08-19T04:30:00Z" />
          <meta property="og:description" content="Historic clean energy transition package cleared by ministerial council." />
          <meta property="og:image" content="https://nationaltimes.local/media/clean_energy.jpg" />
          <link rel="canonical" href="https://nationaltimes.local/news/clean-energy-package" />
        </head>
        <body>
          <article>
            <h1>Cabinet Clears Clean Energy Package</h1>
            <p>The council cleared the initiative today with ₹12,000 Cr in funding for solar hubs.</p>
            <img src="https://nationaltimes.local/media/chart.png" alt="Energy Allocation Breakdown Chart" />
            <a href="https://pib.gov.in/press/123">Official PIB Gazette Notification</a>
            <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Press Briefing Video"></iframe>
          </article>
        </body>
      </html>
    `;

    const res = extractHtmlAssetsAndMetadata(sampleHtml, 'https://nationaltimes.local/news/clean-energy-package');

    assert.strictEqual(res.metadata.title, 'Cabinet Clears Clean Energy Package - National Times');
    assert.strictEqual(res.metadata.author, 'Aarav Sharma');
    assert.strictEqual(res.metadata.publisher, 'National Times');
    assert.strictEqual(res.metadata.publishedAt, '2026-08-19T04:30:00.000Z');
    assert.strictEqual(res.metadata.canonicalUrl, 'https://nationaltimes.local/news/clean-energy-package');

    assert.strictEqual(res.discoveredAssets.images.length, 2, 'Should discover lead og:image and article img');
    assert.strictEqual(res.discoveredAssets.videos.length, 1, 'Should discover YouTube video embed');
    assert.strictEqual(res.discoveredAssets.outboundLinks.length, 1);
    assert.strictEqual(res.discoveredAssets.outboundLinks[0].url, 'https://pib.gov.in/press/123');
  });

  // ----------------------------------------------------------------
  // Test 4: Truthful Metadata Rule (Never Fabricate Missing Data)
  // ----------------------------------------------------------------
  await runTest('4. Truthful metadata: Returns null when author or published date is missing', async () => {
    const sparseHtml = `
      <html>
        <head><title>Unsigned Bulletin</title></head>
        <body><article><p>Anonymous statement issued without author or timestamp metadata tags.</p></article></body>
      </html>
    `;

    const res = extractHtmlAssetsAndMetadata(sparseHtml, 'https://bulletin.local/post/1');

    assert.strictEqual(res.metadata.author, null, 'Must NOT fabricate author name');
    assert.strictEqual(res.metadata.publishedAt, null, 'Must NOT fabricate published date');
    assert.strictEqual(res.metadata.description, null);
  });

  // ----------------------------------------------------------------
  // Test 5: Structural Sanitization & Entity Decoding
  // ----------------------------------------------------------------
  await runTest('5. Cleans structural markdown, MediaWiki templates, footnote citations, and escape sequences', async () => {
    const dirtyText = 'The Minister stated &quot;Growth reached 8.2%&quot; in Q1[1][citation needed].\\n\\n{{cite web|title=GDP}} [[Ministry of Finance|Finance Ministry]] allocated funds.';
    const cleaned = cleanExtractedText(dirtyText);

    assert.strictEqual(cleaned, 'The Minister stated "Growth reached 8.2%" in Q1. Finance Ministry allocated funds.');
  });

  // ----------------------------------------------------------------
  // Test 6: Enforces Minimum Word Count & Rejects SSRF
  // ----------------------------------------------------------------
  await runTest('6. Enforces word count threshold and blocks SSRF restricted internal URLs', async () => {
    // A: Short text rejection
    let shortErr = null;
    try {
      await processInputContent({ inputType: 'TEXT', text: 'Too short.' });
    } catch (e) {
      shortErr = e;
    }
    assert.ok(shortErr);
    assert.strictEqual(shortErr.status, 400);

    // B: SSRF rejection
    let ssrfErr = null;
    try {
      await processInputContent({ inputType: 'URL', url: 'http://169.254.169.254/latest/meta-data/' });
    } catch (e) {
      ssrfErr = e;
    }
    assert.ok(ssrfErr);
    assert.strictEqual(ssrfErr.status, 400);
    assert.ok(ssrfErr.message.includes('restricted'));
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 20 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage20MultiModalInputTests();
