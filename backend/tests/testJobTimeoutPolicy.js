const assert = require('assert');
const { resolveJobTimeoutMs } = require('../src/services/verificationPipeline');
const { getJobTimeoutReason } = require('../src/services/sseManager');

const timeoutKeys = [
  'PIPELINE_TIMEOUT_MS',
  'PHOTO_PIPELINE_TIMEOUT_MS',
  'VIDEO_PIPELINE_TIMEOUT_MS'
];
const originalEnvironment = Object.fromEntries(timeoutKeys.map(key => [key, process.env[key]]));

try {
  process.env.PIPELINE_TIMEOUT_MS = '180000';
  process.env.PHOTO_PIPELINE_TIMEOUT_MS = '300000';
  process.env.VIDEO_PIPELINE_TIMEOUT_MS = '600000';

  assert.strictEqual(resolveJobTimeoutMs('TEXT'), 180000);
  assert.strictEqual(resolveJobTimeoutMs('PHOTO'), 300000);
  assert.strictEqual(resolveJobTimeoutMs('VIDEO'), 600000);

  process.env.VIDEO_PIPELINE_TIMEOUT_MS = '1000';
  assert.strictEqual(resolveJobTimeoutMs('VIDEO'), 60000, 'unsafe short timeouts must be clamped');

  const now = Date.now();
  const activeLongRunningJob = {
    createdAt: new Date(now - 6 * 60 * 1000).toISOString(),
    updatedAt: new Date(now - 10 * 1000).toISOString()
  };
  assert.strictEqual(
    getJobTimeoutReason(activeLongRunningJob, now, 4 * 60 * 1000, 15 * 60 * 1000),
    null,
    'an old job with recent progress must not be treated as stalled'
  );

  const stalledJob = {
    createdAt: new Date(now - 6 * 60 * 1000).toISOString(),
    updatedAt: new Date(now - 5 * 60 * 1000).toISOString()
  };
  assert.match(
    getJobTimeoutReason(stalledJob, now, 4 * 60 * 1000, 15 * 60 * 1000),
    /no progress update/
  );

  const overLifetimeJob = {
    createdAt: new Date(now - 16 * 60 * 1000).toISOString(),
    updatedAt: new Date(now - 10 * 1000).toISOString()
  };
  assert.match(
    getJobTimeoutReason(overLifetimeJob, now, 4 * 60 * 1000, 15 * 60 * 1000),
    /absolute safety limit/
  );

  console.log('Job timeout policy tests passed.');
} finally {
  timeoutKeys.forEach(key => {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  });
}
