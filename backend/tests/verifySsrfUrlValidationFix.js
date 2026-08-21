const assert = require('assert');
const { processInputContent } = require('../src/services/inputReader');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const { isSsrfSafeUrl } = require('../src/services/ssrfGuard');

async function verifySsrfUrlValidationFix() {
  console.log('===============================================================');
  console.log('🧪 Verifying SSRF URL Validation & End-to-End Pipeline Fix...');
  console.log('===============================================================\n');

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

  // 1. Submitting http://localhost and http://127.0.0.1 — should be rejected with SSRF error
  await runTest('1. Reject http://localhost and http://127.0.0.1 with SSRF error', async () => {
    let err1 = null;
    try {
      await processInputContent({ inputType: 'URL', url: 'http://localhost:5000/api/v1/health' });
    } catch (e) {
      err1 = e;
    }
    assert.ok(err1, 'Should have thrown restricted URL error');
    assert.strictEqual(err1.status, 400);
    assert.ok(err1.message.includes('Invalid or restricted URL') || err1.message.includes('Restricted host'), `Unexpected msg: ${err1.message}`);

    let err2 = null;
    try {
      await processInputContent({ inputType: 'URL', url: 'http://127.0.0.1:8080/admin' });
    } catch (e) {
      err2 = e;
    }
    assert.ok(err2, 'Should have thrown restricted URL error');
    assert.strictEqual(err2.status, 400);
    assert.ok(err2.message.includes('Invalid or restricted URL') || err2.message.includes('Restricted host'), `Unexpected msg: ${err2.message}`);
  });

  // 2. Submitting http://192.168.1.1 — should be rejected with SSRF error
  await runTest('2. Reject private subnet http://192.168.1.1 with SSRF error', async () => {
    let err = null;
    try {
      await processInputContent({ inputType: 'URL', url: 'http://192.168.1.1/router' });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'Should have thrown restricted URL error');
    assert.strictEqual(err.status, 400);
    assert.ok(err.message.includes('Invalid or restricted URL') || err.message.includes('Private/internal IP address rejected'), `Unexpected msg: ${err.message}`);
  });

  // 3. Submitting legitimate HTTPS URL — processes processInputContent without isSsrfSafeUrl ReferenceError
  await runTest('3. Process legitimate HTTPS URL without ReferenceError', async () => {
    const ssrfCheck = isSsrfSafeUrl('https://news.ycombinator.com');
    assert.strictEqual(ssrfCheck.safe, true);

    try {
      const res = await processInputContent({ inputType: 'URL', url: 'https://news.ycombinator.com' });
      assert.ok(res.sourceTitle);
      assert.strictEqual(typeof res.extractedText, 'string');
    } catch (err) {
      assert.notStrictEqual(err.name, 'ReferenceError');
      assert.ok(!err.message.includes('isSsrfSafeUrl is not defined'));
    }
  });

  // 4. End-to-End Pipeline Execution (URL → content extraction → Agent 2 → Agent 3 → Agent 4 → report)
  await runTest('4. Full End-to-End Pipeline execution with URL input without error', async () => {
    const reportData = await runVerificationPipeline({
      jobId: `test_e2e_ssrf_fix_${Date.now()}`,
      inputType: 'URL',
      url: 'https://example.com/news/article-to-verify',
      selectedTypes: ['FACT_CHECKING'],
      userId: null
    });

    assert.ok(reportData);
    assert.ok(reportData.summary);
    assert.strictEqual(typeof reportData.factualAccuracyScore, 'number');
  });

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('---------------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

verifySsrfUrlValidationFix();
