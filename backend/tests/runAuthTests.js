const app = require('../src/app');
const http = require('http');

// Helper to make HTTP requests against in-memory server
function makeRequest(server, path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (body) {
      const dataStr = JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('==============================================');
  console.log('🧪 Running ETRAI Auth Integration Tests...');
  console.log('==============================================\n');

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName) => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    const testEmail = `test_${Date.now()}@etrai.ai`;
    const testPassword = 'SecurePassword123!';
    let authCookie = null;
    let authToken = null;

    // Test 1: Signup with new user
    const signupRes = await makeRequest(server, '/api/v1/auth/signup', { method: 'POST' }, {
      email: testEmail,
      password: testPassword
    });
    assert(signupRes.statusCode === 201, 'Signup returns HTTP 201 Created');
    assert(signupRes.body?.user?.email === testEmail.toLowerCase(), 'Signup returns correct user email');
    
    // Extract Set-Cookie header
    const setCookie = signupRes.headers['set-cookie'];
    assert(setCookie && setCookie[0].includes('token='), 'Signup sets httpOnly token cookie');
    if (setCookie) {
      authCookie = setCookie[0].split(';')[0];
    }
    if (signupRes.body?.token) {
      authToken = signupRes.body.token;
    }

    // Test 2: Login with correct credentials
    const loginRes = await makeRequest(server, '/api/v1/auth/login', { method: 'POST' }, {
      email: testEmail,
      password: testPassword
    });
    assert(loginRes.statusCode === 200, 'Login returns HTTP 200 OK');
    assert(loginRes.body?.user?.email === testEmail.toLowerCase(), 'Login returns authenticated user');

    // Test 3: Login with wrong password
    const wrongLoginRes = await makeRequest(server, '/api/v1/auth/login', { method: 'POST' }, {
      email: testEmail,
      password: 'WrongPassword999'
    });
    assert(wrongLoginRes.statusCode === 401, 'Login with wrong password rejects with HTTP 401');

    // Test 4: Protected route with Cookie authentication
    const meWithCookieRes = await makeRequest(server, '/api/v1/auth/me', {
      method: 'GET',
      headers: { Cookie: authCookie }
    });
    assert(meWithCookieRes.statusCode === 200, 'Protected route /me accepts valid cookie');
    assert(meWithCookieRes.body?.user?.email === testEmail.toLowerCase(), 'Protected route returns user profile');

    // Test 5: Protected route with Bearer Header authentication
    const meWithHeaderRes = await makeRequest(server, '/api/v1/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert(meWithHeaderRes.statusCode === 200, 'Protected route /me accepts valid Bearer token');

    // Test 6: Protected route without authentication
    const meUnauthRes = await makeRequest(server, '/api/v1/auth/me', { method: 'GET' });
    assert(meUnauthRes.statusCode === 401, 'Protected route /me rejects unauthenticated request');

    // Test 7: Logout
    const logoutRes = await makeRequest(server, '/api/v1/auth/logout', { method: 'POST' });
    assert(logoutRes.statusCode === 200, 'Logout returns HTTP 200 OK');

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    console.log('\n----------------------------------------------');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------------');
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runTests();
