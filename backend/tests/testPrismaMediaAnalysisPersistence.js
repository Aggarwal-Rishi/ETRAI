const assert = require('assert');
const { prisma, dbService } = require('../src/utils/prisma');

async function runPrismaMediaAnalysisPersistenceTests() {
  console.log('===========================================================');
  console.log('🧪 Running Prisma MediaAnalysis Persistence Test Suite...');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

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

  let testUser = null;
  if (prisma) {
    testUser = await prisma.user.upsert({
      where: { email: 'prisma_media_test@etrai.local' },
      update: {},
      create: {
        email: 'prisma_media_test@etrai.local',
        passwordHash: 'hashed_password_123'
      }
    });
  }

  // ----------------------------------------------------
  // Test 1: Create Analysis with MediaAnalysis Relation
  // ----------------------------------------------------
  await runTest('1. Create Analysis with MediaAnalysis -> persists metadata, hash, and JSON strings', async () => {
    const analysisId = `test_media_persist_${Date.now()}`;

    const record = await prisma.analysis.create({
      data: {
        id: analysisId,
        title: 'Video Verification: clip.mp4',
        inputType: 'VIDEO',
        inputSource: 'clip.mp4',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        summary: 'Video analysis summary',
        overallMetrics: JSON.stringify({ factCheckingScore: 85 }),
        reportData: JSON.stringify({ summary: 'Video analysis summary' }),
        user: { connect: { id: testUser.id } },
        mediaAnalysis: {
          create: {
            mediaType: 'VIDEO',
            filename: 'clip.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 1542000,
            sha256: 'a1b2c3d4e5f678901234567890abcdef',
            width: 1920,
            height: 1080,
            duration: 14.5,
            fps: 30.0,
            codec: 'h264',
            metadataJson: JSON.stringify({ hasAudio: true }),
            ocrText: '[Timestamp 0s]: Apex Solar Park',
            transcriptJson: JSON.stringify({ transcript: 'Apex Solar reached 100MW operational capacity in 2026.' }),
            visualFindingsJson: JSON.stringify({ visualDescription: 'Solar panels array' }),
            manipulationSignalsJson: JSON.stringify([{ type: 'LIGHTING', severity: 'LOW' }]),
            reverseSearchJson: JSON.stringify({ status: 'UNAVAILABLE', matches: [] })
          }
        }
      },
      include: { mediaAnalysis: true }
    });

    assert.ok(record);
    assert.ok(record.mediaAnalysis);
    assert.strictEqual(record.mediaAnalysis.mediaType, 'VIDEO');
    assert.strictEqual(record.mediaAnalysis.filename, 'clip.mp4');
    assert.strictEqual(record.mediaAnalysis.sha256, 'a1b2c3d4e5f678901234567890abcdef');
    assert.strictEqual(record.mediaAnalysis.width, 1920);
    assert.strictEqual(record.mediaAnalysis.height, 1080);
    assert.strictEqual(record.mediaAnalysis.duration, 14.5);
    assert.strictEqual(record.mediaAnalysis.ocrText, '[Timestamp 0s]: Apex Solar Park');
  });

  // ----------------------------------------------------
  // Test 2: Query via dbService.findAnalysisById
  // ----------------------------------------------------
  await runTest('2. Query via dbService.findAnalysisById -> includes mediaAnalysis relation', async () => {
    const analysisId = `test_media_query_${Date.now()}`;

    await prisma.analysis.create({
      data: {
        id: analysisId,
        title: 'Photo Verification: photo.jpg',
        inputType: 'PHOTO',
        inputSource: 'photo.jpg',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        summary: 'Photo summary',
        user: { connect: { id: testUser.id } },
        mediaAnalysis: {
          create: {
            mediaType: 'PHOTO',
            filename: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 450000,
            sha256: 'fedcba09876543210987654321fedcba',
            metadataJson: JSON.stringify({ cameraMake: 'Canon', hasExif: true })
          }
        }
      }
    });

    const item = await dbService.findAnalysisById(analysisId, testUser.id);
    assert.ok(item);
    assert.ok(item.mediaAnalysis);
    assert.strictEqual(item.mediaAnalysis.mediaType, 'PHOTO');
    assert.strictEqual(item.mediaAnalysis.filename, 'photo.jpg');

    const meta = JSON.parse(item.mediaAnalysis.metadataJson);
    assert.strictEqual(meta.cameraMake, 'Canon');
    assert.strictEqual(meta.hasExif, true);
  });

  // ----------------------------------------------------
  // Test 3: Backward Compatibility for Text-Only Analysis
  // ----------------------------------------------------
  await runTest('3. Backward compatibility -> Text Analysis without mediaAnalysis remains valid (null relation)', async () => {
    const analysisId = `test_text_compat_${Date.now()}`;

    await prisma.analysis.create({
      data: {
        id: analysisId,
        title: 'Pasted Text Analysis',
        inputType: 'TEXT',
        inputSource: 'Pasted text sample...',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        summary: 'Text summary',
        user: { connect: { id: testUser.id } }
      }
    });

    const item = await dbService.findAnalysisById(analysisId, testUser.id);
    assert.ok(item);
    assert.strictEqual(item.mediaAnalysis, null);
  });

  // ----------------------------------------------------
  // Test 4: Cascade Deletion
  // ----------------------------------------------------
  await runTest('4. Cascade deletion -> deleting Analysis removes associated MediaAnalysis', async () => {
    const analysisId = `test_cascade_${Date.now()}`;

    await prisma.analysis.create({
      data: {
        id: analysisId,
        title: 'Cascade Delete Test',
        inputType: 'PHOTO',
        inputSource: 'photo.jpg',
        selectedTypes: JSON.stringify(['FACT_CHECKING']),
        status: 'COMPLETED',
        user: { connect: { id: testUser.id } },
        mediaAnalysis: {
          create: {
            mediaType: 'PHOTO',
            filename: 'photo.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1000,
            sha256: '123456'
          }
        }
      }
    });

    // Delete analysis
    await prisma.analysis.delete({ where: { id: analysisId } });

    // Verify MediaAnalysis record is deleted
    const orphan = await prisma.mediaAnalysis.findUnique({ where: { analysisId } });
    assert.strictEqual(orphan, null);
  });

  console.log('\n-----------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('-----------------------------------------------------------\n');

  if (failed > 0) process.exit(1);
}

runPrismaMediaAnalysisPersistenceTests();
