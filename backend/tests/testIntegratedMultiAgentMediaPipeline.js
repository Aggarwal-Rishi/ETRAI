const assert = require('assert');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');
const { prisma } = require('../src/utils/prisma');

async function runIntegratedMultiAgentMediaPipelineTests() {
  console.log('===========================================================');
  console.log('🧪 Running Integrated 4-Agent Media Pipeline Test Suite...');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  const originalEnv = { ...process.env };
  process.env.ETRAI_TEST_MODE = 'mock';
  delete process.env.OPENAI_API_KEY;

  const resetEnv = () => { process.env = { ...originalEnv }; };

  let testUserId = null;
  if (prisma) {
    try {
      const u = await prisma.user.upsert({
        where: { email: 'pipeline_media_test@etrai.local' },
        update: {},
        create: {
          email: 'pipeline_media_test@etrai.local',
          passwordHash: 'password123'
        }
      });
      testUserId = u.id;
    } catch (e) {
      console.error('[Test DB Setup Error]:', e.message);
    }
  }

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}\n${e.stack}`);
      failed++;
    }
  };

  const createValidJpegBuffer = () => Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]),
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x01, 0x20, 0x01, 0x90, 0x03]),
    Buffer.from('sample jpeg body bytes')
  ]);

  const createValidMp4Buffer = () => {
    const b = Buffer.alloc(100);
    b.writeUInt32BE(32, 0);
    b.write('ftyp', 4, 4, 'ascii');
    b.write('isom', 8, 4, 'ascii');
    return b;
  };

  // ----------------------------------------------------
  // Test 1: Full 4-Agent Pipeline Execution for PHOTO Input
  // ----------------------------------------------------
  await runTest('1. Full 4-Agent Pipeline for PHOTO -> outputs report with mediaAnalysis & claims', async () => {
    const file = { originalname: 'solar_photo.jpg', mimetype: 'image/jpeg', buffer: createValidJpegBuffer() };

    const reportData = await runVerificationPipeline({
      jobId: `test_job_photo_${Date.now()}`,
      userId: testUserId,
      inputType: 'PHOTO',
      text: 'Apex Solar reached 100MW operational capacity in 2026.',
      file,
      selectedTypes: ['FACT_CHECKING']
    });

    assert.ok(reportData);
    assert.strictEqual(reportData.mediaAnalysis.mediaType, 'PHOTO');
    assert.ok(reportData.mediaAnalysis.file.sha256);
    assert.ok(Array.isArray(reportData.claims));
    assert.ok(reportData.claims.length > 0);
    assert.ok(reportData.scores);
    assert.ok(reportData.observability);
  });

  // ----------------------------------------------------
  // Test 2: Full 4-Agent Pipeline Execution for VIDEO Input
  // ----------------------------------------------------
  await runTest('2. Full 4-Agent Pipeline for VIDEO -> outputs report with transcript, frames & claims', async () => {
    const file = { originalname: 'solar_video.mp4', mimetype: 'video/mp4', buffer: createValidMp4Buffer() };

    const reportData = await runVerificationPipeline({
      jobId: `test_job_video_${Date.now()}`,
      userId: testUserId,
      inputType: 'VIDEO',
      text: 'Apex Solar video demonstration 2026',
      file,
      selectedTypes: ['FACT_CHECKING']
    });

    assert.ok(reportData);
    assert.strictEqual(reportData.mediaAnalysis.mediaType, 'VIDEO');
    assert.ok(reportData.mediaAnalysis.file.sha256);
    assert.ok(Array.isArray(reportData.claims));
    assert.ok(reportData.scores);
    assert.ok(reportData.observability);
  });

  // ----------------------------------------------------
  // Test 3: Photo SSE Progress Stages
  // ----------------------------------------------------
  await runTest('3. Photo SSE stages -> emits MEDIA_VALIDATION, MEDIA_METADATA, VISUAL_ANALYSIS, CLAIM_EXTRACTION, WEB_VERIFICATION', async () => {
    const emittedStages = [];
    const mockSseManager = require('../src/services/sseManager');
    const origEmit = mockSseManager.emitProgress;

    mockSseManager.emitProgress = (jobId, payload) => {
      if (payload.stage) emittedStages.push(payload.stage);
    };

    try {
      const file = { originalname: 'test_photo_sse.jpg', mimetype: 'image/jpeg', buffer: createValidJpegBuffer() };

      await runVerificationPipeline({
        jobId: `test_job_photo_sse_${Date.now()}`,
        userId: testUserId,
        inputType: 'PHOTO',
        text: 'Photo verification context test',
        file,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.ok(emittedStages.includes('MEDIA_VALIDATION'));
      assert.ok(emittedStages.includes('MEDIA_METADATA'));
      assert.ok(emittedStages.includes('VISUAL_ANALYSIS'));
      assert.ok(emittedStages.includes('CLAIM_EXTRACTION'));
      assert.ok(emittedStages.includes('WEB_VERIFICATION'));
      assert.ok(emittedStages.includes('REPORT_GENERATION'));
    } finally {
      mockSseManager.emitProgress = origEmit;
    }
  });

  // ----------------------------------------------------
  // Test 4: Video SSE Progress Stages
  // ----------------------------------------------------
  await runTest('4. Video SSE stages -> emits MEDIA_VALIDATION, MEDIA_METADATA, KEYFRAME_EXTRACTION, FRAME_ANALYSIS, CLAIM_EXTRACTION', async () => {
    const emittedStages = [];
    const mockSseManager = require('../src/services/sseManager');
    const origEmit = mockSseManager.emitProgress;

    mockSseManager.emitProgress = (jobId, payload) => {
      if (payload.stage) emittedStages.push(payload.stage);
    };

    try {
      const file = { originalname: 'test_video_sse.mp4', mimetype: 'video/mp4', buffer: createValidMp4Buffer() };

      await runVerificationPipeline({
        jobId: `test_job_video_sse_${Date.now()}`,
        userId: testUserId,
        inputType: 'VIDEO',
        text: 'Video verification context test',
        file,
        selectedTypes: ['FACT_CHECKING']
      });

      assert.ok(emittedStages.includes('MEDIA_VALIDATION'));
      assert.ok(emittedStages.includes('MEDIA_METADATA'));
      assert.ok(emittedStages.includes('KEYFRAME_EXTRACTION'));
      assert.ok(emittedStages.includes('FRAME_ANALYSIS'));
      assert.ok(emittedStages.includes('CLAIM_EXTRACTION'));
      assert.ok(emittedStages.includes('WEB_VERIFICATION'));
      assert.ok(emittedStages.includes('REPORT_GENERATION'));
    } finally {
      mockSseManager.emitProgress = origEmit;
    }
  });

  // ----------------------------------------------------
  // Test 5: Honest Stage Skipping (No fake OCR progress)
  // ----------------------------------------------------
  await runTest('5. Honest stage skipping -> OCR stage skipped when text is absent', async () => {
    const emittedStages = [];
    const mockSseManager = require('../src/services/sseManager');
    const origEmit = mockSseManager.emitProgress;

    mockSseManager.emitProgress = (jobId, payload) => {
      if (payload.stage) emittedStages.push(payload.stage);
    };

    try {
      const file = { originalname: 'no_ocr_photo.jpg', mimetype: 'image/jpeg', buffer: createValidJpegBuffer() };

      await runVerificationPipeline({
        jobId: `test_job_no_ocr_${Date.now()}`,
        userId: testUserId,
        inputType: 'PHOTO',
        text: 'Clean photo without text',
        file,
        selectedTypes: ['FACT_CHECKING']
      });

      // Since vision API key is absent in mock test mode, no OCR text was extracted -> OCR stage must NOT be emitted
      assert.strictEqual(emittedStages.includes('OCR'), false, 'Must NOT emit OCR stage when no text was extracted');
    } finally {
      mockSseManager.emitProgress = origEmit;
    }
  });

  // ----------------------------------------------------
  // Test 6: Agent 1 & Agent 2 Truth Bounds
  // ----------------------------------------------------
  await runTest('6. Agent 1 & Agent 2 truth bounds -> Agent 1/2 output observations & claims, Agent 3 determines truth', async () => {
    const file = { originalname: 'claim_test.jpg', mimetype: 'image/jpeg', buffer: createValidJpegBuffer() };

    const reportData = await runVerificationPipeline({
      jobId: `test_job_truth_bounds_${Date.now()}`,
      userId: testUserId,
      inputType: 'PHOTO',
      text: 'Apex Solar reached 100MW operational capacity in 2026.',
      file,
      selectedTypes: ['FACT_CHECKING']
    });

    // Verify Agent 1 provided observations
    assert.strictEqual(reportData.mediaAnalysis.valid, true);
    // Verify Agent 2 formatted claims as propositions
    assert.ok(reportData.claims[0].claimText.includes('claimed to depict'));
    // Verify Agent 3 determined canonical verdict & score
    assert.ok(reportData.articleVerdict);
    assert.ok(typeof reportData.factualAccuracyScore === 'number');
  });

  // ----------------------------------------------------
  // Test 7: Observability Telemetry Logging
  // ----------------------------------------------------
  await runTest('7. Observability telemetry -> logs phase durations, media attributes, and provider status', async () => {
    const file = { originalname: 'telemetry_test.mp4', mimetype: 'video/mp4', buffer: createValidMp4Buffer() };

    const reportData = await runVerificationPipeline({
      jobId: `test_job_telemetry_${Date.now()}`,
      userId: testUserId,
      inputType: 'VIDEO',
      text: 'Telemetry testing video payload',
      file,
      selectedTypes: ['FACT_CHECKING']
    });

    const obs = reportData.observability;
    assert.ok(obs);
    assert.ok(obs.jobId);
    assert.ok(obs.phases);
    assert.ok(obs.phases.phase1_contentReader);
    assert.ok(obs.phases.phase2_claimExtractor);
    assert.ok(obs.phases.phase3_factVerifier);
    assert.ok(obs.phases.phase4_reportGenerator);
    assert.ok(obs.providerStatus);
  });

  // ----------------------------------------------------
  // Test 8: Backward Compatibility for TEXT Inputs
  // ----------------------------------------------------
  await runTest('8. Backward compatibility -> TEXT input pipeline executes smoothly', async () => {
    const reportData = await runVerificationPipeline({
      jobId: `test_job_text_compat_${Date.now()}`,
      userId: testUserId,
      inputType: 'TEXT',
      text: 'Apex Solar announced the completion of its 100MW solar park in 2026. The facility will generate green electricity for over 50,000 households.',
      selectedTypes: ['FACT_CHECKING']
    });

    assert.ok(reportData);
    assert.strictEqual(reportData.mediaAnalysis, null);
    assert.ok(reportData.claims.length > 0);
    assert.ok(reportData.scores);
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------------\n');

  resetEnv();
  if (failed > 0) process.exit(1);
}

runIntegratedMultiAgentMediaPipelineTests();
