'use strict';

process.env.ETRAI_TEST_MODE = 'mock';
process.env.SERPER_API_KEY = '';
process.env.GEMINI_API_KEY = '';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { processInputContent } = require('../src/services/inputReader');
const { evaluateSemanticStance } = require('../src/services/semanticVerification');

const fixtureDir = path.join(__dirname, 'fixtures', 'multiformat');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));

const formatConfigs = [
  { ext: 'txt', inputType: 'FILE', mime: 'text/plain' },
  { ext: 'pdf', inputType: 'FILE', mime: 'application/pdf' },
  { ext: 'docx', inputType: 'FILE', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: 'png', inputType: 'PHOTO', mime: 'image/png', includeContext: true },
  { ext: 'mp4', inputType: 'VIDEO', mime: 'video/mp4', includeContext: true }
];

const evidenceByCase = {
  real: 'The World Health Organization is the United Nations agency responsible for international public health.',
  false: 'The World Health Organization did not announce that ocean saltwater cures viral infections; health authorities warn that drinking saltwater is dangerous.',
  ambiguous: 'The Pune municipal directory lists registered health facilities but publishes no walk-in visit total for that neighborhood clinic.'
};

function expectedStance(caseId) {
  if (caseId === 'real') return 'SUPPORTS';
  if (caseId === 'false') return 'REFUTES';
  return null;
}

async function main() {
  let passed = 0;
  const rows = [];
  for (const item of manifest.cases) {
    for (const format of formatConfigs) {
      const filename = `${item.id}.${format.ext}`;
      const buffer = fs.readFileSync(path.join(fixtureDir, filename));
      const result = await processInputContent({
        inputType: format.inputType,
        text: format.includeContext ? item.text : undefined,
        file: { originalname: filename, mimetype: format.mime, buffer, size: buffer.length }
      }, { enableReverseSearch: false });

      assert.ok(result.extractedText && result.wordCount > 0, `${filename} must yield analyzable text/context`);
      assert.ok(result.metadata.sha256 && result.metadata.sha256.length === 64, `${filename} must yield SHA-256 metadata`);
      if (format.inputType === 'PHOTO' || format.inputType === 'VIDEO' || ['pdf', 'docx'].includes(format.ext)) {
        assert.ok(result.mediaAnalysis, `${filename} must preserve media/document analysis`);
      }

      const semantic = evaluateSemanticStance(item.text, evidenceByCase[item.id]);
      const expected = expectedStance(item.id);
      if (expected) assert.strictEqual(semantic.stance, expected, `${filename} classification stance`);
      else assert.ok(['NEUTRAL', 'IRRELEVANT'].includes(semantic.stance), `${filename} ambiguous case must not be promoted to support or refutation`);

      rows.push({ fixture: filename, words: result.wordCount, media: Boolean(result.mediaAnalysis), stance: semantic.stance });
      passed++;
    }
  }

  // Raw claim text is the sixth user-facing intake format and uses the same
  // three verdict fixtures without file parsing.
  for (const item of manifest.cases) {
    const result = await processInputContent({ inputType: 'TEXT', text: item.text });
    assert.ok(result.wordCount > 0 && result.metadata.sha256.length === 64);
    const semantic = evaluateSemanticStance(item.text, evidenceByCase[item.id]);
    const expected = expectedStance(item.id);
    if (expected) assert.strictEqual(semantic.stance, expected);
    else assert.ok(['NEUTRAL', 'IRRELEVANT'].includes(semantic.stance));
    rows.push({ fixture: `raw-text:${item.id}`, words: result.wordCount, media: false, stance: semantic.stance });
    passed++;
  }

  console.table(rows);
  console.log(`PASS: ${passed}/${manifest.cases.length * formatConfigs.length + manifest.cases.length} controlled real/false/ambiguous format cases`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
