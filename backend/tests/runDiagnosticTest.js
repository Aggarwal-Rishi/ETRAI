const { verifyClaims } = require('../src/services/factVerifier');

async function runDiagnostic() {
  console.log('==============================================');
  console.log('🔍 RUNNING AGENT 3 DIAGNOSTIC TEST...');
  console.log('==============================================');

  const fakeClaim = {
    id: 'claim_fake_1',
    text: 'Indian Prime Minister Narendra Modi announced an immediate military campaign against Russia in a surprise press conference today in New Delhi.',
    category: 'Event Assertion'
  };

  console.log(`\nInput Claim: "${fakeClaim.text}"\n`);

  const results = await verifyClaims([fakeClaim]);

  console.log('\n==============================================');
  console.log('📋 FINAL VERIFICATION OUTPUT FOR CLAIM:');
  console.log('==============================================');
  console.log(JSON.stringify(results, null, 2));
}

runDiagnostic().catch(console.error);
