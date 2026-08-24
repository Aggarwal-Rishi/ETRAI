const fetch = require('node-fetch');
require('dotenv').config();

async function testSerper() {
  const serperKey = process.env.SERPER_API_KEY;
  console.log('Testing Serper API key:', serperKey ? serperKey.substring(0, 8) + '...' : 'NONE');

  // Test 1: Serper /search
  console.log('\n--- 1. Testing https://google.serper.dev/search ---');
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'Soumitra Dutta Oxford Said Business School', num: 3 }),
      timeout: 8000
    });
    console.log('Search HTTP Status:', res.status);
    const data = await res.json();
    console.log('Search Response Body:', JSON.stringify(data));
    console.log('Organic results count:', data.organic?.length || 0);
    if (data.organic?.[0]) {
      console.log('Top organic result:', data.organic[0].title, '->', data.organic[0].link);
    }
  } catch (err) {
    console.error('Search error:', err.message);
  }

  // Test 2: Serper /images
  console.log('\n--- 2. Testing https://google.serper.dev/images ---');
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: 'Soumitra Dutta Oxford Said Business School', num: 3 }),
      timeout: 8000
    });
    console.log('Images HTTP Status:', res.status);
    const data = await res.json();
    console.log('Images count:', data.images?.length || 0);
    if (data.images?.[0]) {
      console.log('Top image result:', data.images[0].title, '->', data.images[0].imageUrl, 'Source:', data.images[0].link);
    }
  } catch (err) {
    console.error('Images error:', err.message);
  }
}

testSerper().catch(console.error);
