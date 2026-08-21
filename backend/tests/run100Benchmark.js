require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runVerificationPipeline } = require('../src/services/verificationPipeline');

async function run100ItemBenchmark() {
  console.log('================================================================');
  console.log('🚀 RUNNING 100-ITEM BENCHMARK TEST SUITE (50 REAL + 50 FAKE)');
  console.log('================================================================\n');

  const benchmarkPath = path.join(__dirname, 'fixtures', 'benchmark100.json');
  if (!fs.existsSync(benchmarkPath)) {
    console.error('❌ Error: benchmark100.json fixture not found!');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const realItems = items.filter(item => item.id.startsWith('real_'));
  const fakeItems = items.filter(item => item.id.startsWith('fake_'));

  console.log(`📊 Benchmark Suite Overview:`);
  console.log(`   - Real News Items : ${realItems.length}`);
  console.log(`   - Fake News Items : ${fakeItems.length}`);
  console.log(`   - Total Test Items: ${items.length}\n`);

  let realPassed = 0;
  let realFailed = 0;
  let fakePassed = 0;
  let fakeFailed = 0;

  const failures = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isReal = item.id.startsWith('real_');
    const label = isReal ? '[REAL NEWS]' : '[FAKE NEWS]';
    
    console.log(`----------------------------------------------------------------`);
    console.log(`Item ${i + 1}/${items.length} ${label} (${item.id}): "${item.input.substring(0, 70)}..."`);

    try {
      const jobId = `bench_${item.id}_${Date.now()}`;
      const payload = {
        jobId,
        userId: 'benchmark_user',
        inputType: item.type === 'URL' ? 'URL' : 'TEXT',
        url: item.type === 'URL' ? item.input : null,
        text: item.type === 'TEXT' ? item.input : null,
        selectedTypes: ['FACT_CHECKING']
      };

      const result = await runVerificationPipeline(payload);
      const calculatedVerdict = result.verdict || result.manipulationAnalysis?.verdict || 'SUSPICIOUS';

      let isSuccess = false;
      if (isReal) {
        // Real news must be scored as TRUSTED or SUSPICIOUS (never FABRICATED)
        isSuccess = calculatedVerdict === 'TRUSTED' || calculatedVerdict === 'SUSPICIOUS';
        if (isSuccess) realPassed++;
        else {
          realFailed++;
          failures.push({ item, calculatedVerdict, expected: 'TRUSTED/SUSPICIOUS' });
        }
      } else {
        // Fake news must be scored as FABRICATED (never TRUSTED)
        isSuccess = calculatedVerdict === 'FABRICATED';
        if (isSuccess) fakePassed++;
        else {
          fakeFailed++;
          failures.push({ item, calculatedVerdict, expected: 'FABRICATED' });
        }
      }

      console.log(`   Result Verdict  : ${calculatedVerdict}`);
      console.log(`   Expected        : ${isReal ? 'TRUSTED / SUSPICIOUS' : 'FABRICATED'}`);
      console.log(`   Evaluation      : ${isSuccess ? '✅ PASS' : '❌ FAIL'}`);

    } catch (err) {
      console.error(`   ❌ Execution Error on ${item.id}:`, err.message);
      if (isReal) realFailed++;
      else fakeFailed++;
      failures.push({ item, error: err.message });
    }
  }

  console.log('\n================================================================');
  console.log('🏆 100-ITEM BENCHMARK FINAL RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`  Real News Accuracy : ${realPassed}/${realItems.length} (${((realPassed / realItems.length) * 100).toFixed(1)}%)`);
  console.log(`  Fake News Accuracy : ${fakePassed}/${fakeItems.length} (${((fakePassed / fakeItems.length) * 100).toFixed(1)}%)`);
  console.log(`  Overall Accuracy   : ${realPassed + fakePassed}/${items.length} (${(((realPassed + fakePassed) / items.length) * 100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (failures.length > 0) {
    console.log('⚠️ MISCLASSIFIED BENCHMARK ITEMS DETAILS:');
    failures.forEach((f, idx) => {
      console.log(`   ${idx + 1}. [${f.item.id}] "${f.item.input.substring(0, 60)}..."`);
      console.log(`      Got: ${f.calculatedVerdict || f.error} | Expected: ${f.expected}`);
    });
    console.log('');
  }

  return {
    realPassed,
    realItemsCount: realItems.length,
    fakePassed,
    fakeItemsCount: fakeItems.length,
    overallPassed: realPassed + fakePassed,
    totalItems: items.length
  };
}

if (require.main === module) {
  run100ItemBenchmark().then(res => {
    if (res.realPassed < 50 || res.fakePassed < 50) {
      console.log('⚠️ Target score (≥50 Real PASS, ≥50 Fake PASS) not met yet.');
      process.exit(1);
    } else {
      console.log('🎉 TARGET SCORE ACHIEVED! ALL 100 BENCHMARK TESTS PASSED!');
    }
  });
}

module.exports = { run100ItemBenchmark };
