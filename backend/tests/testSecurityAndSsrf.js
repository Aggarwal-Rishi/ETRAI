const assert = require('assert');
const { isSsrfSafeUrl, isPrivateOrRestrictedIp } = require('../src/services/ssrfGuard');
const { registerStream } = require('../src/services/sseManager');

async function runSecurityAndSsrfTests() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI Security & SSRF Guard Tests...');
  console.log('==============================================\n');

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

  // Test 1: SSRF Rejection of Restricted Hostnames & Protocols
  await runTest('1. SSRF Guard rejects localhost, loopback, private IPs, metadata endpoints, and non-HTTP protocols', () => {
    const restrictedUrls = [
      'http://localhost:8080/admin',
      'http://127.0.0.1:3000/api',
      'http://127.0.0.2/secret',
      'http://0.0.0.0/',
      'http://10.0.0.1/internal-dashboard',
      'http://172.16.0.1/router',
      'http://192.168.1.1/config',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'file:///etc/passwd',
      'file:///c:/windows/win.ini',
      'ftp://example.com/file.txt',
      'gopher://127.0.0.1:70/'
    ];

    for (const url of restrictedUrls) {
      const check = isSsrfSafeUrl(url);
      assert.strictEqual(check.safe, false, `URL '${url}' MUST be rejected by SSRF guard`);
    }
  });

  // Test 2: Legitimate Public News URLs Allowed
  await runTest('2. SSRF Guard permits legitimate public HTTPS news URLs', () => {
    const validPublicUrls = [
      'https://reuters.com/business/finance/article-123',
      'https://bbc.com/news/world-asia-456789',
      'https://apnews.com/article/technology-ai-update',
      'https://news.ycombinator.com/item?id=12345'
    ];

    for (const url of validPublicUrls) {
      const check = isSsrfSafeUrl(url);
      assert.strictEqual(check.safe, true, `Legitimate news URL '${url}' MUST be allowed by SSRF guard`);
    }
  });

  // Test 3: Private IP Address Detection Logic
  await runTest('3. isPrivateOrRestrictedIp detects all IPv4/IPv6 restricted subnets', () => {
    assert.strictEqual(isPrivateOrRestrictedIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('10.255.0.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('172.20.1.1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('192.168.0.100'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('::1'), true);
    assert.strictEqual(isPrivateOrRestrictedIp('8.8.8.8'), false);
    assert.strictEqual(isPrivateOrRestrictedIp('1.1.1.1'), false);
  });

  // Test 4: SSE Stream Authorization (User A cannot access User B's job)
  await runTest('4. SSE stream rejects unauthorized user cross-job access (returns HTTP 403 Forbidden)', async () => {
    const { emitProgress, activeJobs } = require('../src/services/sseManager');
    
    const jobId = 'test_job_user_b_123';
    emitProgress(jobId, { userId: 'user_b_id', status: 'PROCESSING', progress: 50 });

    let statusCode = null;
    let responseBody = null;

    const mockRes = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => {
            responseBody = body;
          }
        };
      },
      setHeader: () => {},
      write: () => {},
      end: () => {}
    };

    const mockReq = { on: () => {} };

    // Authenticated as User A attempting to stream User B's job
    await registerStream(jobId, mockRes, mockReq, 'user_a_id');

    assert.strictEqual(statusCode, 403, 'Attempting to stream another user job MUST return 403 Forbidden');
    assert.ok(responseBody?.error?.includes('Access denied'), 'Error message must specify access denied');
    
    // Clean up test activeJobs
    activeJobs.delete(jobId);
  });

  // Test 5: Authorized SSE Stream Access
  await runTest('5. SSE stream permits job owner access to their own active job', async () => {
    const { emitProgress, activeJobs } = require('../src/services/sseManager');
    
    const jobId = 'test_job_user_a_456';
    emitProgress(jobId, { userId: 'user_a_id', status: 'PROCESSING', progress: 50 });

    let headersSet = {};
    let dataWritten = [];

    const mockRes = {
      setHeader: (key, val) => { headersSet[key] = val; },
      write: (data) => { dataWritten.push(data); },
      end: () => {}
    };

    const mockReq = { on: () => {} };

    // Authenticated as job owner User A
    await registerStream(jobId, mockRes, mockReq, 'user_a_id');

    assert.strictEqual(headersSet['Content-Type'], 'text/event-stream');
    assert.ok(dataWritten.some(d => d.includes('user_a_id')), 'Owner MUST receive stream progress update');

    // Clean up test activeJobs
    activeJobs.delete(jobId);
  });

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  process.exit(failed > 0 ? 1 : 0);
}

runSecurityAndSsrfTests();
