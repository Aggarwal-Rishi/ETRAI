const app = require('../src/app');
const fetch = require('node-fetch');
const assert = require('assert');

let server;
let PORT = 5099;
let BASE_URL = `http://localhost:${PORT}/api/v1`;

async function startTestServer() {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      resolve();
    });
  });
}

function stopTestServer() {
  if (server) server.close();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runE2ETest() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI Full End-to-End Flow Test...');
  console.log('==============================================\n');

  await startTestServer();

  let passed = 0;
  let failed = 0;

  const runStep = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  const testEmail = `e2e_user_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword2026!';
  let authToken = '';
  let authCookie = '';
  let textJobId = '';
  let secondJobId = '';

  // ---------------------------------------------------------
  // STEP 1: Signup User
  // ---------------------------------------------------------
  await runStep('Step 1: User Signup (POST /auth/signup)', async () => {
    const res = await fetch(`${BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201, `Status should be 201 Created`);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, testEmail);
    assert.ok(data.token, 'Token must be returned');
    authToken = data.token;

    const cookieHeader = res.headers.get('set-cookie');
    if (cookieHeader) {
      authCookie = cookieHeader.split(';')[0];
    }
  });

  // ---------------------------------------------------------
  // STEP 2: Login User
  // ---------------------------------------------------------
  await runStep('Step 2: User Login (POST /auth/login)', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, 'Status should be 200 OK');
    assert.strictEqual(data.user.email, testEmail);
    assert.ok(data.token);
  });

  // ---------------------------------------------------------
  // STEP 3: Protected Profile Check
  // ---------------------------------------------------------
  await runStep('Step 3: Access Protected Route (GET /auth/me)', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Cookie': authCookie
      }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.user.email, testEmail);
  });

  // ---------------------------------------------------------
  // STEP 4: Submit Pasted Text Analysis (All 3 Category Types)
  // ---------------------------------------------------------
  await runStep('Step 4: Submit Pasted Text Analysis (POST /verify/analyze)', async () => {
    const textContent = `
      Global cloud infrastructure expenditure reached $78.4 billion in Q4 2025, recording a 21% year-over-year expansion.
      Enterprise adoption of automated AI compliance and verification systems increased by 38% across North American financial firms.
      Independent audits confirmed that 94% of reported transaction entries were fully reconciled without manual intervention.
      Furthermore, analysts project artificial intelligence software sales to surpass $120 billion globally by the end of 2026.
      Despite macroeconomic challenges, major technology vendors reported strong double-digit growth in cloud subscription revenues.
    `;

    const res = await fetch(`${BASE_URL}/verify/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        inputType: 'TEXT',
        text: textContent,
        selectedTypes: ['FACT_CHECKING', 'FAKE_NEWS_DETECTION', 'BUSINESS_REPORT']
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 202, 'Status should be 202 Accepted');
    assert.strictEqual(data.success, true);
    assert.ok(data.jobId, 'Job ID must be returned');
    assert.strictEqual(data.status, 'PROCESSING');
    textJobId = data.jobId;
  });

  // Wait for 4-Agent pipeline to process text job in background
  await sleep(1500);

  // ---------------------------------------------------------
  // STEP 5: View Results & Report Structure
  // ---------------------------------------------------------
  await runStep('Step 5: Fetch Report Details & Verify Scores (GET /reports/:id)', async () => {
    const res = await fetch(`${BASE_URL}/reports/${textJobId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, 'Report detail should return 200 OK');
    assert.ok(data.report, 'Report object must exist');
    
    const reportData = data.report.reportData || data.report;
    assert.ok(reportData.scores.factCheckingScore !== undefined, 'Fact checking score present');
    assert.ok(reportData.scores.fakeNewsScore !== undefined, 'Fake news score present');
    assert.ok(reportData.scores.businessReportScore !== undefined, 'Business report score present');
    assert.ok(Array.isArray(reportData.claims) && reportData.claims.length > 0, 'Claims list present');
    assert.ok(reportData.summary && reportData.recommendation, 'AI summary & recommendation present');
    assert.ok(Array.isArray(reportData.chartData) && reportData.chartData.length === 3, 'Chart visualization payload present');
  });

  // ---------------------------------------------------------
  // STEP 6: Submit Second Analysis (Business Report Verification)
  // ---------------------------------------------------------
  await runStep('Step 6: Submit Second Analysis Job (POST /verify/analyze)', async () => {
    const sampleText2 = `
      Renewable energy installations generated over 450 gigawatts of clean electricity globally during 2025.
      Solar power additions represented 62% of new capacity investments across European grid operators.
      Financial reports confirmed quarterly capital expenditure in battery storage technology grew by 28% year over year.
      Operational efficiency improvements reduced grid curtailment losses to less than 2.5% across primary transmission corridors.
      Energy analysts expect sustained investment growth above 15% through the rest of the current decade.
    `;

    const res = await fetch(`${BASE_URL}/verify/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        inputType: 'TEXT',
        text: sampleText2,
        selectedTypes: ['FACT_CHECKING', 'BUSINESS_REPORT']
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 202);
    assert.ok(data.jobId);
    secondJobId = data.jobId;
  });

  await sleep(1500);

  // ---------------------------------------------------------
  // STEP 7: Check User History List
  // ---------------------------------------------------------
  await runStep('Step 7: Check History List (GET /reports)', async () => {
    const res = await fetch(`${BASE_URL}/reports`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.reports), 'Reports history should be array');
    assert.ok(data.reports.length >= 2, `Should contain at least 2 analysis items, found ${data.reports.length}`);
  });

  // ---------------------------------------------------------
  // STEP 8: Delete Analysis from History
  // ---------------------------------------------------------
  await runStep('Step 8: Delete Report from History (DELETE /reports/:id)', async () => {
    const res = await fetch(`${BASE_URL}/reports/${secondJobId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);

    // Verify deletion
    const checkRes = await fetch(`${BASE_URL}/reports/${secondJobId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    assert.strictEqual(checkRes.status, 404, 'Deleted report should return 404 Not Found');
  });

  console.log('\n----------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------\n');

  stopTestServer();

  if (failed > 0) process.exit(1);
}

runE2ETest().catch(err => {
  console.error('[E2E Test Execution Error]:', err);
  stopTestServer();
  process.exit(1);
});
