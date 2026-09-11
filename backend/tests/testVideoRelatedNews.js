const assert = require('assert');
const { collectVideoRelatedNews } = require('../src/services/media/videoRelatedNews');

function run() {
  const provenance = {
    frameSearches: [{
      frameIndex: 0,
      timestamp: 4,
      exactMatch: true,
      matches: [{
        sourceUrl: 'https://news.example/a',
        title: 'Minister addresses the national energy summit',
        snippet: 'The minister addressed delegates at the national energy summit in Delhi.',
        domain: 'news.example',
        publisher: 'Example News',
        publishedAt: '2026-01-01T10:00:00Z',
        similarity: 0.94,
        contextualVerdict: 'CONTEXT_SUPPORTED'
      }, {
        sourceUrl: 'https://news.example/copy',
        title: 'Minister addresses the national energy summit',
        snippet: 'The minister addressed delegates at the national energy summit in Delhi.',
        domain: 'news.example',
        publisher: 'Example News',
        publishedAt: '2026-01-02T10:00:00Z',
        similarity: 0.93,
        contextualVerdict: 'CONTEXT_SUPPORTED'
      }]
    }],
    transcriptSearch: {
      matches: [{
        sourceUrl: 'https://video.example/full',
        title: 'Full summit speech and transcript',
        snippet: 'Full remarks from the national energy summit in Delhi.',
        domain: 'video.example',
        publisher: 'Video Network',
        publishedAt: '2025-12-31T10:00:00Z',
        transcriptEvidenceScore: 91,
        strongTranscriptMatch: true,
        sourceTranscriptAvailable: true,
        transcriptMatchType: 'SOURCE_VIDEO_TRANSCRIPT_EXACT_QUOTE',
        matchedTranscriptPhrases: ['Our national energy programme begins today.']
      }]
    },
    sourceCandidates: []
  };

  const result = collectVideoRelatedNews({
    provenance,
    videoSummary: 'Minister addresses delegates at national energy summit in Delhi',
    transcript: 'Our national energy programme begins today.',
    entities: ['Minister', 'Delhi']
  }, { allowExternalVisualSearch: true, allowExternalTranscriptSearch: true });

  assert.strictEqual(result.status, 'AVAILABLE');
  assert.strictEqual(result.readableArticleCount, 3);
  assert.strictEqual(result.evidenceEligibleCount, 2, 'same-publisher copy should not count twice');
  assert.strictEqual(result.independentPublisherCount, 2);
  assert.strictEqual(result.overallContextVerdict, 'CONTEXT_SUPPORTED');
  assert.strictEqual(result.earliestPublication.url, 'https://video.example/full');
  assert.ok(result.articles.some(article => article.sourceRole === 'SYNDICATED_OR_DUPLICATE_VIDEO_NEWS'));
  assert.ok(result.articles.some(article => article.mediaLinkStatus === 'STRONG_SOURCE_TRANSCRIPT_LINK'));

  const withheld = collectVideoRelatedNews({ provenance }, {});
  assert.strictEqual(withheld.status, 'WITHHELD');
  assert.strictEqual(withheld.articles.length, 0);
  console.log('Video related-news verification tests passed.');
}

run();
