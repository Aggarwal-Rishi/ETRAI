// Deterministic provider-boundary regressions: no network calls or database writes.
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
process.env.SERPER_API_KEY = 'YOUR_SERPER_API_KEY_HERE';
process.env.ETRAI_TEST_MODE = 'mock';
let sdkResponse = {}, requests = [], prompts = [];
const sdkPath = require.resolve('@google/genai');
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: {
  GoogleGenAI: class { constructor() { this.models = { generateContent: async options => {
    prompts.push(options.contents); return { text: JSON.stringify(sdkResponse) };
  } }; } }
} };
const fetchPath = require.resolve('node-fetch');
require.cache[fetchPath] = { id: fetchPath, filename: fetchPath, loaded: true, exports: async (url, options = {}) => {
  assert.equal(url, 'https://google.serper.dev/search', 'Unexpected network request');
  requests.push(JSON.parse(options.body));
  return { ok: true, status: 200, json: async () => ({organic:[{title:'Boundary fixture',link:'https://fixture.test/article',snippet:'Controlled evidence.'}]}) };
} };
const { extractClaims, extractMockClaims, extractParagraphsAndSentences, computeInternalConsistency } = require('../src/services/claimExtractor');
const { cleanHtml, cleanExtractedText } = require('../src/services/inputReader');
const { searchSerper, extractSearchKeywords, buildSearchRepresentation, verifyClaims } = require('../src/services/factVerifier');
const { normalizeArticleContext, selectEvidencePassage, verificationContext } = require('../src/services/articleContext');
const { guardEvidence, measurements } = require('../src/services/evidenceGuard');
const { evaluateSemanticStance } = require('../src/services/semanticVerification');
const { performPerClaimDeepResearch } = require('../src/services/articleResearch');
const { generateClaimCorrection } = require('../src/services/correctionsService');
const { calculateCategoryScores, generateReport } = require('../src/services/reportGenerator');
const { computeExplainableTrustScore } = require('../src/services/explainableScoringService');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
(async () => {
 await test('HTML and reader preserve paragraph boundaries', () => {
   const html = '<article><p>Alice Morgan opened a hospital in Bristol.</p><p>Bob Taylor was appointed mayor in London.</p></article>';
   const text = cleanExtractedText(cleanHtml(html));
   assert.match(text, /Bristol\.\n+Bob/);
   assert.equal(extractParagraphsAndSentences(text).sentenceStructure.length,2);
 });
 await test('Fallback resolves nearby actor without copying the first city', () => {
   const claims = extractMockClaims('Alice Morgan opened a hospital in Bristol.\n\nBob Taylor was appointed mayor in London. He said the council would build ten schools.');
   const bob = claims.find(c => /appointed/.test(c.text));
   const quote = claims.find(c => /said/.test(c.text));
   assert(bob && quote);
   assert(!bob.text.includes('Bristol')); assert.match(quote.text,/^Bob Taylor said/);
   assert.equal(bob.claimMeaning.location,'London');
   assert(!buildSearchRepresentation(bob).entities.includes('Alice Morgan'));
   assert.match(verificationContext(quote),/Bob Taylor was appointed/);
 });
 await test('Zero-evidence verification retains article and source context for re-search', async () => {
   const claim=extractMockClaims('Alice Morgan opened a hospital in Bristol.')[0];
   const [verified]=await verifyClaims([claim],{mockSearchResults:[]});
   assert.equal(verified.verdict,'UNVERIFIED');
   assert.deepEqual(verified.sourceContext,claim.sourceContext);
   assert.deepEqual(verified.claimMeaning,claim.claimMeaning);
   assert.deepEqual(verified.articleContext,claim.articleContext);
   assert.equal(verified.searchQuery,claim.searchQuery);
 });
 await test('Basic factual sales statement is retained', () => {
   assert(extractMockClaims('The company sells solar panels worldwide.').length);
 });
 await test('Ambiguous pronouns stay flagged', () => {
   const claim = extractMockClaims('He announced construction of a new airport on Monday.')[0];
   assert(claim); assert.equal(claim.independentlySearchable,false); assert.equal(claim.coreferenceResolved,false);
 });
 await test('Context contract does not select one of several locations', () => {
   const c = normalizeArticleContext({locations:['London','Bristol'],dates:['2024','2025'],mainEvent:'Appointment'});
   assert.equal(c.location,null); assert.equal(c.date,null); assert.equal(c.event,'Appointment');
 });
 await test('Outgoing Serper request preserves full negative Unicode query', async () => {
   process.env.SERPER_API_KEY = 'regression-provider-key'; process.env.ETRAI_TEST_MODE = 'real';
   const query = 'According to officials, München Labs did not acquire Beta in London for $450 million in June 2024';
   assert.equal(extractSearchKeywords(query),query);
   const result = await searchSerper(query);
   assert.equal(requests.at(-1).q,query); assert.equal(result.serperHttpStatus,200); assert.equal(result.rawResultCount,1);
   process.env.ETRAI_TEST_MODE='mock'; process.env.SERPER_API_KEY='YOUR_SERPER_API_KEY_HERE';
 });
 await test('LLM sees beyond 8,000 characters and original metadata', async () => {
   process.env.GEMINI_API_KEY='regression-gemini-key'; process.env.ETRAI_TEST_MODE='real';
   const tail = 'München Labs announced the expansion in London on June 20, 2024.';
   sdkResponse = {articleContext:{mainEvent:'Expansion',locations:['London']},claims:[{
     originalText:tail,resolvedText:tail,claimMeaning:{subject:'München Labs'},independentlySearchable:true
   }]};
   const claims = await extractClaims('Background information. '.repeat(450)+'\n\n'+tail,{title:'Expansion report',publishedAt:'2024-06-20'});
   assert(prompts.at(-1).includes(tail)); assert(prompts.at(-1).includes('Expansion report'));
   assert.equal(claims[0].sourceContext.paragraph,tail); assert.equal(claims[0].claimMeaning.subject,'München Labs');
   assert(Array.isArray(claims[0].claimMeaning.quantities)); assert.equal(claims[0].extractionMode,'REAL_LLM');
   process.env.GEMINI_API_KEY='YOUR_GEMINI_API_KEY_HERE';process.env.ETRAI_TEST_MODE='mock';
 });
 await test('Evidence selection reaches relevant passages beyond 3,000 characters', () => {
   const tail = 'The Delhi hostel has eight rooms and sixteen beds across four floors.';
   const selected=selectEvidencePassage('Unrelated background. '.repeat(500)+'\n\n'+tail,tail);
   assert(selected.includes(tail));
 });
 await test('A rejection is supported by the same rejection statement', () => {
   const text='Acme rejected the proposed Beta acquisition.';
   assert.equal(evaluateSemanticStance({text},{snippet:text}).stance,'SUPPORTS');
 });
 await test('An article cannot independently verify its own claims', () => {
   const text='Acme rejected the proposed Beta acquisition.';
   const result=guardEvidence({text,articleContext:{sourceUrl:'https://fixture.test/article?ref=home'}},{url:'https://fixture.test/article',snippet:text},{stance:'SUPPORTS'});
   assert.equal(result.stance,'NEUTRAL'); assert.equal(result.isInputSource,true);
 });
 await test('Different year is not counter-evidence', () => {
   const checked=guardEvidence('The factory employed 200 workers in 2024.',{snippet:'The factory employed 100 workers in 2020.'},{stance:'REFUTES'});
   assert.equal(checked.stance,'NEUTRAL');
 });
 await test('Different city is not counter-evidence', () => {
   assert.equal(evaluateSemanticStance({text:'The robbery occurred in Mumbai on Monday.',claimMeaning:{subject:'robbery',location:'Mumbai'}},{title:'The robbery occurred in Delhi on Monday.'}).stance,'NEUTRAL');
 });
 await test('Compatible totals and per-floor figures do not refute each other', () => {
   const evidence='The hostel has two rooms per floor and two beds per room across four floors.';
   assert.equal(measurements(evidence).totals.get('bed'),16);
   assert.equal(guardEvidence('The hostel has eight rooms and sixteen beds across four floors.',{snippet:evidence},{stance:'REFUTES'}).stance,'NEUTRAL');
 });
 await test('Deep research does not classify rejected as false', async () => {
   const text='Acme rejected the proposed Beta acquisition.';
   const result=await performPerClaimDeepResearch({text},null,false,[{title:text,snippet:text,url:'https://fixture.test/rejection',domain:'fixture.test'}]);
   assert.equal(result.evaluatedSources[0].stance,'SUPPORTS'); assert.notEqual(result.evidenceState,'REFUTED');
   assert(result.decomposedQueries.every(q=>q.includes(text)));
 });
 await test('Correction never changes eight rooms to sixteen rooms using bed counts', async () => {
   const result=await generateClaimCorrection({text:'The hostel has 8 rooms and 16 beds.'},{verdict:'FALSE',sources:[{stance:'REFUTES',snippet:'There are 16 beds across four floors.'}]});
   assert.equal(result.hasCorrection,false); assert.equal(result.correctedClaim,null);
 });
 await test('Different events and dates do not create internal contradictions', () => {
   assert.deepEqual(computeInternalConsistency('',[{text:'Bristol hospital employs 10 workers in 2023.'},{text:'London hospital employs 20 workers in 2024.'}]),[]);
   assert.equal(computeInternalConsistency('',[{text:'London hospital employs 10 workers.'},{text:'London hospital employs 20 workers.'}]).length,1);
 });
 await test('A social-only contradiction cannot mark a factual claim false', async () => {
   const claim={id:'social-guard',text:'The Satya Niketan PG had 16 beds.',entities:['Satya Niketan'],articleContext:{headline:'Satya Niketan PG collapse'}};
   const [verified]=await verifyClaims([claim],{mockSearchResults:[{index:0,title:'Social post disputes bed count',url:'https://instagram.com/reel/example',domain:'instagram.com',snippet:'A social post claims the Satya Niketan PG had 75 beds.',sourceType:'SOCIAL_MEDIA',authorityKnown:true,authorityScore:38,relevanceScore:90}]});
   assert.notEqual(verified.verdict,'FALSE');
   assert.notEqual(verified.status,'FABRICATED');
 });

 await test('One false claim does not label a mixed article entirely false', () => {
   assert.equal(calculateCategoryScores([{verdict:'FALSE'},{verdict:'VERIFIED'},{verdict:'VERIFIED'}]).articleVerdict,'PARTIALLY_VERIFIED');
   assert.equal(calculateCategoryScores([{verdict:'FALSE'}]).articleVerdict,'FALSE');
   assert.equal(calculateCategoryScores([{verdict:'UNVERIFIED'}]).articleVerdict,'UNVERIFIED');
 });
 await test('Empty evidence does not imply a false report', () => {
   assert.notEqual(computeExplainableTrustScore({claims:[{verdict:'UNVERIFIED',sources:[]}]}).verdict,'FALSE');
 });
 await test('Article evidence count preserves a source accepted for any claim', async () => {
   const source={url:'https://fixture.test/report',domain:'fixture.test',title:'Fixture evidence'};
   const result=await generateReport({sourceTitle:'Regression fixture',extractedText:'Regression fixture article.',traceProvenance:false,verifiedClaims:[
     {claimText:'First proposition',verdict:'VERIFIED',confidence:80,sources:[{...source,stance:'SUPPORTS'}]},
     {claimText:'Second proposition',verdict:'UNVERIFIED',confidence:30,sources:[{...source,stance:'NEUTRAL'}]}
   ]});
   assert.match(result.summary,/based on 1 evidentiary source/);
   assert.equal(result.sources.filter(s=>s.stance==='SUPPORTS').length,1);
 });
 console.log(`\n${count} article verification regressions passed.`);
})().catch(error => { console.error(error); process.exitCode=1; });
