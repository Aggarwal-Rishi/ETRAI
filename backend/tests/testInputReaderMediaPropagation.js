const assert = require('assert');

const orchestratorPath = require.resolve('../src/services/media/mediaOrchestrator');
const fakeImageAnalysis = {
  valid: true,
  mediaType: 'IMAGE',
  file: { filename: 'photo.png', mimeType: 'image/png', sizeBytes: 8, sha256: 'abc' },
  metadata: { width: 1392, height: 736 },
  ocrText: 'Visible image context for regression coverage',
  visualDescription: 'A public event photograph',
  imageForensics: { reportItem: { originalFoundStatus: 'CANDIDATE' } },
  images: [{ originalFoundStatus: 'CANDIDATE' }],
  forensicEvidence: [],
  forensicVerdict: 'NO_MANIPULATION_SIGNAL_FOUND'
};

require.cache[orchestratorPath] = {
  id: orchestratorPath,
  filename: orchestratorPath,
  loaded: true,
  exports: {
    processMediaAnalysis: async ({ inputType }) => ({
      ...fakeImageAnalysis,
      mediaType: inputType,
      transcript: inputType === 'VIDEO' ? 'Video transcript retained by the input reader' : ''
    })
  }
};

const { processInputContent } = require('../src/services/inputReader');

(async () => {
  const imageResult = await processInputContent({
    inputType: 'IMAGE',
    file: {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    }
  });
  assert.ok(imageResult.mediaAnalysis, 'Image mediaAnalysis must reach the verification pipeline');
  assert.strictEqual(imageResult.mediaAnalysis.imageForensics.reportItem.originalFoundStatus, 'CANDIDATE');

  const videoResult = await processInputContent({
    inputType: 'VIDEO',
    file: {
      originalname: 'clip.mp4',
      mimetype: 'video/mp4',
      buffer: Buffer.from('video-test')
    }
  });
  assert.ok(videoResult.mediaAnalysis, 'Video mediaAnalysis must reach the verification pipeline');
  assert.strictEqual(videoResult.mediaAnalysis.mediaType, 'VIDEO');

  console.log('Input reader media propagation tests passed (2/2).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
