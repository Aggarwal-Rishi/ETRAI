const assert = require('assert');
const {
  buildCoreAnalysisData,
  ensureCompletedJobPersisted
} = require('../src/services/sseManager');

async function run() {
  const job = {
    userId: 'user_test',
    status: 'COMPLETED',
    reportData: {
      sourceTitle: 'Recovered dossier',
      inputType: 'TEXT',
      summary: 'Completed report',
      scores: { overallTrustScore: 73 },
      claims: [{ claimText: 'A claim' }]
    }
  };

  const coreData = buildCoreAnalysisData('job_recovery_test', job);
  assert.strictEqual(coreData.id, 'job_recovery_test');
  assert.strictEqual(coreData.userId, 'user_test');
  assert.strictEqual(coreData.status, 'COMPLETED');
  assert.strictEqual(coreData.trustScore, 73);
  assert.strictEqual(JSON.parse(coreData.reportData).claims.length, 1);

  let createAttempts = 0;
  let createdData = null;
  const database = {
    analysis: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createAttempts += 1;
        if (createAttempts === 1) throw new Error('temporary database failure');
        createdData = data;
        return data;
      }
    }
  };

  const recovered = await ensureCompletedJobPersisted('job_recovery_test', job, database, {
    attempts: 2,
    retryDelays: [0, 0]
  });
  assert.strictEqual(recovered, true);
  assert.strictEqual(createAttempts, 2, 'completed dossier persistence must retry transient failures');
  assert.strictEqual(createdData.title, 'Recovered dossier');

  console.log('Completed job persistence recovery tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
