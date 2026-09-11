const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
process.env.SERPER_API_KEY = 'YOUR_SERPER_API_KEY_HERE';
process.env.ETRAI_TEST_MODE = 'mock';
const { groupClaims, summarizeClaimGroups } = require('../src/services/claimGroups');
const { extractClaims } = require('../src/services/claimExtractor');
const { buildSearchRepresentation, generateMultiPerspectiveQueries, verifyClaims } = require('../src/services/factVerifier');
const { verificationContext } = require('../src/services/articleContext');
const { rebuildReportScoring } = require('../src/controllers/verifyController');

async function run() {
  const assertions = [
    { id: 'arrest', groupId: 'hostel', groupTopic: 'Hostel collapse', text: 'Police arrested Sudhanshu after the Satya Niketan hostel collapse.', verdict: 'VERIFIED', confidence: 80 },
    { id: 'beds', groupId: 'hostel', groupTopic: 'Hostel collapse', text: 'The Satya Niketan hostel had eight rooms and sixteen beds.', verdict: 'UNVERIFIED', confidence: 25 },
    { id: 'bank', groupId: 'bank', groupTopic: 'Bank results', text: 'Acme Bank reported a 10 percent rise in annual profit.', verdict: 'FALSE', confidence: 85 }
  ];
  assertions.extractionMode='REAL_LLM';
  const claims=groupClaims(assertions);
  assert.equal(claims.length,3,'Keep each separately verified assertion');
  assert.equal(claims.extractionMode,'REAL_LLM','Retain extraction metadata');
  assert.equal(claims[0].claimGroup.id,claims[1].claimGroup.id);
  assert.notEqual(claims[0].claimGroup.id,claims[2].claimGroup.id);
  assert(claims[0].claimGroup.text.includes('sixteen beds'));
  assert(!claims[0].text.includes('sixteen beds'),'Do not broaden the individual verification target');
  assert(!claims[0].claimGroup.text.includes('Acme Bank'));
  const groups=summarizeClaimGroups(claims);
  assert.equal(groups.length,2);
  assert.equal(groups[0].verdict,'MIXED');
  assert.deepEqual(groups[0].counts,{supported:1,contradicted:0,partial:0,unverified:1});
  assert.equal(groups[1].verdict,'FALSE');
  const rep=buildSearchRepresentation(claims[0]);
  const queries=generateMultiPerspectiveQueries(rep);
  assert.equal(queries[0].query, claims[0].text);
  assert(queries.some(q=>q.strategy==='claim_group' && q.query.includes('Hostel collapse')));
  assert(queries.every(q=>!q.query.includes('sixteen beds')), 'Do not search unrelated group details for the arrest');
  const bedQueries=generateMultiPerspectiveQueries(buildSearchRepresentation(claims[1]));
  assert(bedQueries[0].query.includes('eight rooms and sixteen beds'));
  assert(bedQueries.every(q=>!q.query.includes('arrested')), 'Each detail gets its own query');
  assert(queries.every(q=>!/\b(?:Topic|Reported Event|asserted)\b/.test(q.query)));
  const deep=await require('../src/services/articleResearch').performPerClaimDeepResearch(claims[1],null,true,[]);
  assert.equal(deep.decomposedQueries[0], claims[1].text);
  assert(deep.decomposedQueries.every(q=>!q.includes('arrested')));
  assert(queries.some(q=>q.strategy==='canonical' && q.query===claims[0].text),'Keep a precise detail query');
  const context=JSON.parse(verificationContext(claims[0]));
  assert.equal(context.group.text,claims[0].claimGroup.text);
  assert.match(context.evaluationInstruction,/only the target assertion/);
  const verified=await verifyClaims(claims,{mockSearchResults:[]});
  assert.equal(verified[0].claimGroup.text,claims[0].claimGroup.text,'Retain groups even without evidence');
  assert(verified.every(c=>c.verdict==='UNVERIFIED'));
  const confused=groupClaims([{id:'confused',originalText:'The operator of the hostel, which collapsed on Sunday, has been arrested.',text:'The operator of the hostel collapsed on Sunday.'}]);
  assert(confused[0].extractionWarning);
  assert.equal(confused[0].claimGroup.text,confused[0].originalText,'Do not repeat a detected subject mix-up in the group summary');
  const [review]=await verifyClaims(confused,{mockSearchResults:[{index:0,domain:'fixture.test',url:'https://fixture.test/a',snippet:'The hostel collapsed on Sunday.'}]});
  assert.equal(review.verdict,'UNVERIFIED');
  assert.equal(review.evaluationMode,'EXTRACTION_REVIEW_REQUIRED');
  const research=await require('../src/services/articleResearch').performPerClaimDeepResearch(review,null,true,[]);
  assert.equal(research.evidenceState,'INSUFFICIENT','Re-search cannot bypass a flagged extraction');
  assert.deepEqual(research.evaluatedSources,[]);
  const updated=claims.map(c=>c.id==='beds'?{...c,verdict:'VERIFIED'}:c);
  assert.equal(summarizeClaimGroups(updated)[0].verdict,'VERIFIED','Recompute the group from latest detail verdicts');
  const rebuilt=rebuildReportScoring({inputType:'TEXT',sourceTitle:'Grouping regression'},updated);
  assert.equal(rebuilt.claimGroups[0].verdict,'VERIFIED','Persist updated group verdict after individual re-search');
  assert.equal(rebuilt.claims.length,3,'Scoring still uses separately verified details');
  const fallback=await extractClaims('Acme Corporation reported revenue of 500 million dollars and announced 300 layoffs.\n\nBob Taylor was appointed mayor in London.');
  assert(fallback.length>=3);
  assert.equal(fallback[0].claimGroup.id,fallback[1].claimGroup.id,'Related details from one sentence stay together');
  assert.notEqual(fallback[1].claimGroup.id,fallback[2].claimGroup.id,'Unrelated paragraph stays separate');
  // Exercise the production model-response parser with deterministic grouped output.
  const sdkPath=require.resolve('@google/genai');
  const previousSdk=require.cache[sdkPath];
  let prompt='';
  require.cache[sdkPath]={id:sdkPath,filename:sdkPath,loaded:true,exports:{GoogleGenAI:class {
    constructor(){this.models={generateContent:async options=>{
      prompt=options.contents;
      return {text:JSON.stringify({claims:assertions.map(c=>({...c,originalText:c.text,resolvedText:c.text})),articleContext:{mainTopic:'Two separate news events'}})};
    }};}
  }}};
  delete require.cache[require.resolve('../src/services/claimExtractor')];
  process.env.GEMINI_API_KEY='regression-gemini-key';process.env.ETRAI_TEST_MODE='real';
  try {
    const extracted=await require('../src/services/claimExtractor').extractClaims(assertions.map(c=>c.text).join('\n\n'));
    assert.match(prompt,/MAY CONTAIN MULTIPLE ASSERTIONS/);
    assert.equal(extracted[0].claimGroup.id,extracted[1].claimGroup.id);
    assert.notEqual(extracted[1].claimGroup.id,extracted[2].claimGroup.id);
    assert.deepEqual(extracted[0].claimGroup.assertionIds,['arrest','beds']);
    assert.equal(extracted[0].sourceContext.originalSentence,assertions[0].text);
  } finally {
    if(previousSdk)require.cache[sdkPath]=previousSdk;else delete require.cache[sdkPath];
    process.env.GEMINI_API_KEY='YOUR_GEMINI_API_KEY_HERE';process.env.ETRAI_TEST_MODE='mock';
  }
  console.log('Claim grouping tests passed: related details, unrelated topics, mixed verdicts, shared search/context, saved metadata, re-evaluation and fallback extraction.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
