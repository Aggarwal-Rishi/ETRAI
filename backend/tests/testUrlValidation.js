const { validateSourceUrl } = require('../src/services/factVerifier');
const assert = require('assert');

async function testUrlValidation() {
  console.log('====================================================');
  console.log('🧪 TESTING LIVE HTTP URL VALIDATION LOGIC');
  console.log('====================================================\n');

  // Test 1: Real homepage URL should resolve (true)
  console.log('1. Testing real live URL: https://www.bbc.com/news');
  const liveRes = await validateSourceUrl('https://www.bbc.com/news');
  console.log(`   Result: ${liveRes ? '✅ VALID (200/reachable)' : '❌ INVALID'}`);
  assert.strictEqual(liveRes, true, 'Real BBC URL should validate as true');

  // Test 2: Fabricated dead URL should be rejected (false)
  console.log('\n2. Testing fabricated dead URL: https://www.reuters.com/business/market-analysis-quarterly');
  const deadRes = await validateSourceUrl('https://www.reuters.com/business/market-analysis-quarterly');
  console.log(`   Result: ${deadRes ? '❌ FAILED TO CATCH DEAD URL' : '✅ DROPPED DEAD URL (404 Not Found)'}`);
  assert.strictEqual(deadRes, false, 'Fabricated 404 URL must be dropped as false');

  console.log('\n----------------------------------------------------');
  console.log('✅ URL Validation logic verified successfully!');
  console.log('----------------------------------------------------\n');
}

testUrlValidation().catch(console.error);
