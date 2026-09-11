const assert = require('assert');
process.env.GEMINI_API_KEY = '';
const {
  collectImageRelatedNews,
  deduplicateCandidates,
  deduplicateEvidenceArticles
} = require('../src/services/media/imageRelatedNews');
const {
  buildImageSourceEvidence,
  verifyObservationClaimsAgainstImageSource,
  buildImageSourceResearchContext
} = require('../src/services/verificationPipeline');
const { generateReport } = require('../src/services/reportGenerator');

function articleHtml({ title, description, publisher, publishedAt, body }) {
  return `<!doctype html><html><head>
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:site_name" content="${publisher}">
    <meta property="article:published_time" content="${publishedAt}">
  </head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

(async () => {
  const firstUrl = 'https://news-one.example/events/viksit-bharat';
  const secondUrl = 'https://news-two.example/india/viksit-bharat';
  const weakUrl = 'https://lookalike.example/unrelated-crowd';
  const reverseSearch = {
    status: 'AVAILABLE',
    matches: [
      { sourceUrl: firstUrl, originalImageUrl: 'https://img.example/one.jpg', domain: 'news-one.example', similarity: 0.96, matchType: 'LOCAL_PERCEPTUAL_MATCH' },
      { sourceUrl: secondUrl, originalImageUrl: 'https://img.example/two.jpg', domain: 'news-two.example', similarity: 0.93, matchType: 'LOCAL_PERCEPTUAL_MATCH' },
      { sourceUrl: weakUrl, originalImageUrl: 'https://img.example/weak.jpg', domain: 'lookalike.example', similarity: 0.76, matchType: 'UNVERIFIED_VISUAL_CANDIDATE' },
      { sourceUrl: `${firstUrl}#duplicate`, originalImageUrl: 'https://img.example/duplicate.jpg', domain: 'news-one.example', similarity: 0.95, matchType: 'LOCAL_PERCEPTUAL_MATCH' }
    ]
  };
  assert.strictEqual(deduplicateCandidates(reverseSearch).length, 3, 'URL fragments must not create duplicate news pages');
  const syndicated = deduplicateEvidenceArticles([
    { url: 'https://wire.example/first', publisher: 'Wire Desk', title: 'Event report', publishedAt: '2026-01-01', evidenceEligible: true },
    { url: 'https://wire.example/copy', publisher: 'Wire Desk', title: 'Republished event report', publishedAt: '2026-01-02', evidenceEligible: true }
  ]);
  assert.strictEqual(syndicated.filter(article => article.evidenceEligible).length, 1, 'same-publisher copies count once');

  const common = {
    visualSummary: 'A Viksit Bharat 2047 public event with youth participants wearing white uniforms in New Delhi',
    ocrText: 'Viksit Bharat @ 2047',
    entities: ['Viksit Bharat']
  };
  const news = await collectImageRelatedNews({ reverseSearch, ...common }, {
    allowExternalVisualSearch: true,
    disableAi: true,
    sourcePageHtmlByUrl: {
      [firstUrl]: articleHtml({
        title: 'Viksit Bharat event brings youth together',
        description: 'Youth participants in white uniforms attend the Viksit Bharat 2047 event in New Delhi.',
        publisher: 'News One',
        publishedAt: '2026-08-20T08:30:00Z',
        body: 'The public Viksit Bharat gathering in New Delhi brought youth participants together.'
      }),
      [secondUrl]: articleHtml({
        title: 'Participants attend Viksit Bharat 2047 programme',
        description: 'The New Delhi programme included participants in white uniforms.',
        publisher: 'News Two',
        publishedAt: '2026-08-19T06:00:00Z',
        body: 'Viksit Bharat 2047 was visible at the public youth event.'
      }),
      [weakUrl]: articleHtml({
        title: 'A different public crowd',
        description: 'A generic gathering took place elsewhere.',
        publisher: 'Lookalike News',
        publishedAt: '2026-08-18T06:00:00Z',
        body: 'This page has insufficient specific context.'
      })
    }
  });

  assert.strictEqual(news.status, 'AVAILABLE');
  assert.strictEqual(news.readableArticleCount, 3);
  assert.strictEqual(news.evidenceEligibleCount, 2, 'weak visual candidates must not become evidence');
  assert.strictEqual(news.independentPublisherCount, 2);
  assert.strictEqual(news.overallContextVerdict, 'CONTEXT_SUPPORTED');
  assert.strictEqual(news.earliestPublication.url, secondUrl, 'earliest accepted/readable source date should be retained');
  assert.strictEqual(news.articles.find(article => article.url === weakUrl).evidenceEligible, false);

  const mediaAnalysis = { relatedImageNews: news, ocrUncertainty: 8 };
  const evidence = buildImageSourceEvidence(mediaAnalysis);
  assert.strictEqual(evidence.length, 2);
  assert.ok(evidence.every(source => source.locallyVerified && source.stance === 'SUPPORTS'));

  const claims = verifyObservationClaimsAgainstImageSource([
    { id: 'ocr-1', origin: 'IMAGE_OCR_TEXT', claimText: 'The image displays Viksit Bharat 2047.' }
  ], mediaAnalysis);
  assert.strictEqual(claims[0].verdict, 'VERIFIED');
  assert.strictEqual(claims[0].sources.length, 2);

  const mixedClaims = verifyObservationClaimsAgainstImageSource([
    { id: 'visual-mixed', claimText: 'The image is described with disputed context.' }
  ], {
    relatedImageNews: {
      summary: 'Qualified pages disagree about the context.',
      newsDigest: [],
      articles: [
        { ...news.articles[0], evidenceEligible: true, relationship: 'SUPPORTS', contextConfidence: 82 },
        { ...news.articles[1], evidenceEligible: true, relationship: 'REFUTES', contextConfidence: 78 }
      ]
    }
  });
  assert.strictEqual(mixedClaims[0].verdict, 'PARTIALLY_VERIFIED');
  assert.strictEqual(mixedClaims[0].evidenceState, 'MIXED');

  const research = buildImageSourceResearchContext(mediaAnalysis, 'Viksit Bharat 2047');
  assert.strictEqual(research.overallSources.length, 2);
  assert.strictEqual(research.reviewedSources.length, 3);
  assert.ok(research.summary.includes('related news'));

  const report = await generateReport({
    inputType: 'PHOTO',
    sourceTitle: 'Related-image news test',
    extractedText: 'Viksit Bharat 2047',
    verifiedClaims: claims,
    selectedTypes: ['PHOTO'],
    mediaAnalysis: {
      ...mediaAnalysis,
      forensicVerdict: 'NO_MANIPULATION_SIGNAL_FOUND',
      forensics: { integrity: { isValid: true }, verdict: 'NO_MANIPULATION_SIGNAL_FOUND' }
    },
    articleResearchContext: research,
    hasAttachedNews: false
  });
  assert.strictEqual(report.relatedImageNews.evidenceEligibleCount, 2);
  assert.ok(report.summary.includes('Related-image news review examined 3 readable pages'));
  assert.ok(report.sources.filter(source => source.evidenceType === 'VERIFIED_RELATED_IMAGE_NEWS').length >= 2);

  const withheld = await collectImageRelatedNews({ reverseSearch, ...common }, { allowExternalVisualSearch: false });
  assert.strictEqual(withheld.status, 'WITHHELD');
  assert.strictEqual(withheld.articles.length, 0);

  console.log('Image related-news tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
