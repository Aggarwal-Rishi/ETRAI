const { processInputContent } = require('../src/services/inputReader');

async function testVideoUrl() {
  console.log('Testing video URL intake with Instagram link:');
  try {
    const res = await processInputContent({
      inputType: 'VIDEO',
      url: 'https://www.instagram.com/p/C5400gASFWw/'
    });

    console.log('✓ Success! Result:');
    console.log('  Source Title:', res.sourceTitle);
    console.log('  Word Count:', res.wordCount);
    console.log('  Discovered Videos:', res.discoveredAssets.videos);
    console.log('  Raw text excerpt:', res.rawText.substring(0, 150));
  } catch (err) {
    console.error('✗ Error:', err);
  }
}

testVideoUrl();
