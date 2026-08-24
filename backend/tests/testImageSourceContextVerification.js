const assert = require('assert');
const {
  extractSourcePageContext,
  buildDeterministicComparison,
  compareImageSummaryToSource,
  verifyImageSourceContext
} = require('../src/services/media/imageSourceContextVerifier');
const {
  verifyObservationClaimsAgainstImageSource,
  buildImageSourceResearchContext
} = require('../src/services/verificationPipeline');

const sourceHtml = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Viksit Bharat event brings youth participants together">
    <meta property="og:description" content="Participants in white uniforms attend the Viksit Bharat 2047 public event in New Delhi.">
    <meta property="og:site_name" content="Example News">
    <meta property="article:published_time" content="2026-08-20T08:30:00Z">
    <link rel="canonical" href="https://news.example.com/events/viksit-bharat-2047">
  </head>
  <body><article><h1>Viksit Bharat 2047 gathering</h1><p>The public gathering in New Delhi featured youth participants wearing white uniforms and caps.</p></article></body>
</html>`;

(async () => {
  const extracted = extractSourcePageContext(sourceHtml, 'https://news.example.com/events/viksit-bharat-2047');
  assert.strictEqual(extracted.status, 'AVAILABLE');
  assert.ok(extracted.title.includes('Viksit Bharat'));
  assert.ok(extracted.articleText.includes('New Delhi'));
  assert.strictEqual(extracted.publishedAt, '2026-08-20T08:30:00.000Z');

  const deterministic = buildDeterministicComparison({
    visualSummary: 'A Viksit Bharat public gathering with youth participants in white uniforms',
    ocrText: 'Viksit Bharat @ 2047',
    entities: ['Viksit Bharat'],
    sourceContext: extracted
  });
  assert.strictEqual(deterministic.status, 'MATCHED');
  assert.ok(deterministic.matchingDetails.length > 0);

  const normalizedAiConfidence = await compareImageSummaryToSource({
    visualSummary: 'Actor Salman Khan greets the crowd.',
    ocrText: 'Viksit Bharat @ 2047',
    entities: ['Salman Khan'],
    sourceContext: extracted
  }, {
    geminiClient: {
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            status: 'CONTRADICTED',
            confidence: 0.95,
            sourceSummary: 'The source identifies Prime Minister Modi.',
            rationale: 'The named person is materially different.',
            matchingDetails: [],
            contradictions: ['Salman Khan versus Prime Minister Modi']
          })
        })
      }
    }
  });
  assert.strictEqual(normalizedAiConfidence.confidence, 95);

  const verified = await verifyImageSourceContext({
    imageReportItem: {
      originalFoundStatus: 'FOUND',
      originalPageUrl: 'https://news.example.com/events/viksit-bharat-2047'
    },
    reverseSearch: { sourceTitle: extracted.title },
    visualSummary: 'A Viksit Bharat public gathering with youth participants in white uniforms',
    ocrText: 'Viksit Bharat @ 2047',
    entities: ['Viksit Bharat']
  }, { sourcePageHtml: sourceHtml, disableAi: true });
  assert.strictEqual(verified.status, 'MATCHED');
  assert.strictEqual(verified.decisive, true);
  assert.strictEqual(verified.contextualVerdict, 'CONTEXT_SUPPORTED');
  assert.ok(verified.confidence >= 60);

  const candidate = await verifyImageSourceContext({
    imageReportItem: {
      originalFoundStatus: 'CANDIDATE',
      originalPageUrl: 'https://news.example.com/events/viksit-bharat-2047'
    },
    reverseSearch: { sourceTitle: extracted.title },
    visualSummary: 'A Viksit Bharat public gathering with youth participants in white uniforms',
    ocrText: 'Viksit Bharat @ 2047',
    entities: ['Viksit Bharat']
  }, { sourcePageHtml: sourceHtml, disableAi: true });
  assert.strictEqual(candidate.status, 'MATCHED');
  assert.strictEqual(candidate.decisive, false, 'A search candidate must not decide the dossier verdict');

  const claims = [{ id: 'visual-1', claimText: 'The image depicts a Viksit Bharat public gathering.' }];
  const verifiedClaims = verifyObservationClaimsAgainstImageSource(claims, {
    imageSourceContextComparison: verified
  });
  assert.strictEqual(verifiedClaims[0].verdict, 'VERIFIED');
  assert.strictEqual(verifiedClaims[0].sources.length, 1);
  assert.strictEqual(verifiedClaims[0].verificationMode, 'VERIFIED_IMAGE_SOURCE_CONTEXT');

  const contradictedClaims = verifyObservationClaimsAgainstImageSource(claims, {
    imageSourceContextComparison: {
      ...verified,
      status: 'CONTRADICTED',
      contextualVerdict: 'CONTEXT_MISREPRESENTED',
      rationale: 'The source identifies a materially different event.',
      contradictions: ['Different event'],
      decisive: true
    }
  });
  assert.strictEqual(contradictedClaims[0].verdict, 'FALSE');
  assert.strictEqual(contradictedClaims[0].evidenceState, 'CONTRADICTED');

  const research = buildImageSourceResearchContext({ imageSourceContextComparison: verified }, 'Viksit Bharat');
  assert.strictEqual(research.status, 'MATCHED');
  assert.strictEqual(research.overallSources.length, 1);

  console.log('Image source context verification tests passed (8/8).');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
