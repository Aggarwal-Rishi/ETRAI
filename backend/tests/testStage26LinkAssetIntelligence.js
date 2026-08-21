const assert = require('assert');
const {
  performLinkAndAssetIntelligence,
  classifyUrl,
  extractAndClassifyLinks,
  buildAssetInventory
} = require('../src/services/linkAssetService');

async function runStage26LinkAssetIntelligenceTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 26: LINK AND ASSET INTELLIGENCE TEST SUITE');
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
  // Test 1: Classify Primary Sources & Editorial Citations
  // ----------------------------------------------------------------
  await runTest('1. Identifies and classifies primary government sources vs editorial news citations', async () => {
    const govUrl = 'https://pib.gov.in/PressReleasePage.aspx?PRID=2045612';
    const newsUrl = 'https://thehindu.com/news/national/cabinet-approves-scheme.ece';

    const resGov = classifyUrl(govUrl, 'PIB Press Release');
    const resNews = classifyUrl(newsUrl, 'The Hindu Article');

    assert.strictEqual(resGov.category, 'PRIMARY_SOURCE');
    assert.strictEqual(resGov.isPrimarySource, true);
    assert.strictEqual(resGov.verificationStatus, 'VERIFIED_PRIMARY');

    assert.strictEqual(resNews.category, 'EDITORIAL_CITATION');
    assert.strictEqual(resNews.isEditorial, true);
  });

  // ----------------------------------------------------------------
  // Test 2: Detect Affiliate Links and Tracking Pixels
  // ----------------------------------------------------------------
  await runTest('2. Identifies affiliate marketing tokens and analytics tracking parameters', async () => {
    // Affiliate Link
    const affUrl = 'https://amazon.in/dp/B09XYZ?tag=dealspromo-21&subid=webfeed';
    const resAff = classifyUrl(affUrl, 'Buy on Amazon');
    assert.strictEqual(resAff.isAffiliate, true);
    assert.strictEqual(resAff.category, 'AFFILIATE_MARKETING');

    // Tracking / UTM Link
    const utmUrl = 'https://example-news.com/breaking?utm_source=twitter&utm_medium=social&fbclid=IwAR3Xyz';
    const resUtm = classifyUrl(utmUrl, 'Read More');
    assert.strictEqual(resUtm.isTracker, true);
    assert.strictEqual(resUtm.category, 'TRACKING_OR_REDIRECT');
    assert.ok(resUtm.trackingParams.includes('utm_source'));
    assert.ok(resUtm.trackingParams.includes('fbclid'));
  });

  // ----------------------------------------------------------------
  // Test 3: Detect Deceptive Anchor Text
  // ----------------------------------------------------------------
  await runTest('3. Flags deceptive anchor text claiming official authority but pointing to third-party domains', async () => {
    const deceptiveUrl = 'https://unknown-phishing-blog.ru/login';
    const deceptiveAnchor = 'Official PIB Government Portal (gov.in)';

    const res = classifyUrl(deceptiveUrl, deceptiveAnchor);

    assert.strictEqual(res.hasDeceptiveAnchor, true);
    assert.strictEqual(res.securityRisk, 'HIGH');
    assert.strictEqual(res.verificationStatus, 'SUSPICIOUS_REDIRECT');
    assert.ok(res.deceptionExplanation.includes('Anchor text claims authoritative source'));
  });

  // ----------------------------------------------------------------
  // Test 4: Extract Links from HTML and Markdown
  // ----------------------------------------------------------------
  await runTest('4. Extracts links from HTML anchors and markdown notations seamlessly', async () => {
    const htmlContent = `
      <p>Please refer to the <a href="https://rbi.org.in/scripts/BS_PressReleaseDisplay.aspx">RBI Notification</a> for guidelines.</p>
      <p>Check the product review [Special Discount](https://affiliate-hub.com/item?affid=9901).</p>
    `;

    const links = extractAndClassifyLinks(htmlContent);

    assert.strictEqual(links.length, 2);
    const rbiLink = links.find(l => l.domain === 'rbi.org.in');
    const affLink = links.find(l => l.isAffiliate);

    assert.ok(rbiLink);
    assert.strictEqual(rbiLink.isPrimarySource, true);
    assert.ok(affLink);
  });

  // ----------------------------------------------------------------
  // Test 5: Media & Document Asset Inventory
  // ----------------------------------------------------------------
  await runTest('5. Builds complete inventory of images, embedded videos, and downloadable documents', async () => {
    const htmlContent = `
      <div>
        <p>Download the official gazette: <a href="https://egazette.gov.in/circular_2026.pdf">Gazette PDF Document</a></p>
      </div>
    `;

    const discoveredAssets = {
      images: [
        { url: 'https://images.livewire.com/hero_banner.jpg', alt: 'Cabinet briefing stage', isLead: true, width: 1920, height: 1080 },
        { url: 'https://images.livewire.com/infographic_chart.png', alt: 'Budget breakdown chart', isLead: false }
      ],
      videos: [
        { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ', provider: 'youtube', videoId: 'dQw4w9WgXcQ' }
      ]
    };

    const inventory = buildAssetInventory(htmlContent, discoveredAssets);

    assert.strictEqual(inventory.images.length, 2);
    assert.strictEqual(inventory.videos.length, 1);
    assert.strictEqual(inventory.documents.length, 1);

    assert.strictEqual(inventory.images[0].dimensions, '1920x1080');
    assert.strictEqual(inventory.images[0].discoveryLocation, 'Lead Article Header');
    assert.strictEqual(inventory.documents[0].format, 'PDF');
    assert.strictEqual(inventory.documents[0].title, 'Gazette PDF Document');
  });

  // ----------------------------------------------------------------
  // Test 6: Master Link & Asset Intelligence Pipeline
  // ----------------------------------------------------------------
  await runTest('6. performLinkAndAssetIntelligence produces comprehensive link intelligence and asset payload', async () => {
    const text = 'Official gazette published at https://pib.gov.in/release123 with references to https://amazon.in?tag=mydeal-21.';
    const res = await performLinkAndAssetIntelligence(text, {}, 'https://news-hub.com/post');

    assert.strictEqual(res.linkIntelligence.totalLinks, 2);
    assert.strictEqual(res.linkIntelligence.primarySourcesCount, 1);
    assert.strictEqual(res.linkIntelligence.affiliateLinksCount, 1);
    assert.strictEqual(res.summary.primarySources, 1);
  });

  console.log('\n================================================================');
  console.log(`🏆 STAGE 26 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage26LinkAssetIntelligenceTests();
