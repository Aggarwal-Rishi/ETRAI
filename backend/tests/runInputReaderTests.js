const { processInputContent, countWords } = require('../src/services/inputReader');
const assert = require('assert');

async function testInputReader() {
  console.log('==============================================');
  console.log('🧪 Running Input Reader (Agent 1) Tests...');
  console.log('==============================================\n');

  let passed = 0;
  let failed = 0;

  // Helper tester
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

  // Test 1: Short text (<15 words) throws error
  await runTest('Short text (<15 words) returns error', async () => {
    const shortText = 'This is short sample text.';
    try {
      await processInputContent({ inputType: 'TEXT', text: shortText });
      assert.fail('Should have thrown error');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.ok(err.message.includes('minimum of 15 words'));
    }
  });

  // Test 2: Valid text (>15 words) succeeds
  await runTest('Valid text (>15 words) processes successfully', async () => {
    const validText = Array(20).fill('verified').join(' ');
    const res = await processInputContent({ inputType: 'TEXT', text: validText });
    assert.strictEqual(res.wordCount, 20);
    assert.strictEqual(res.truncated, false);
    assert.ok(res.extractedText.startsWith('verified'));
  });

  // Test 3: Truncation for long content (>48k chars)
  await runTest('Long content is automatically truncated', async () => {
    const longText = 'Word '.repeat(10000); // ~50,000 chars
    const res = await processInputContent({ inputType: 'TEXT', text: longText });
    assert.strictEqual(res.truncated, true);
    assert.strictEqual(res.extractedText.length, 48000);
  });

  // Test 4: File upload parsing (.txt)
  await runTest('Text file parsing from buffer succeeds', async () => {
    const fileBuffer = Buffer.from('Apple '.repeat(40));
    const fakeFile = {
      originalname: 'report.txt',
      mimetype: 'text/plain',
      buffer: fileBuffer
    };
    const res = await processInputContent({ inputType: 'FILE', file: fakeFile });
    assert.strictEqual(res.wordCount, 40);
    assert.ok(res.sourceTitle.includes('report.txt'));
  });

  // Test 5: Invalid file format rejects
  await runTest('Unsupported file extension rejects with error', async () => {
    const fakeFile = {
      originalname: 'document.exe',
      mimetype: 'application/x-msdownload',
      buffer: Buffer.from('dummy binary data')
    };
    try {
      await processInputContent({ inputType: 'FILE', file: fakeFile });
      assert.fail('Should have rejected unsupported file');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.ok(err.message.includes('Unsupported file format'));
    }
  });

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

testInputReader();
