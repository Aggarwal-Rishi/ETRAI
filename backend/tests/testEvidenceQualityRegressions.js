const assert=require('node:assert/strict');
process.env.GEMINI_API_KEY='YOUR_GEMINI_API_KEY_HERE';process.env.SERPER_API_KEY='YOUR_SERPER_API_KEY_HERE';process.env.ETRAI_TEST_MODE='mock';
const {evaluateEvidenceBatch,normalizeEvidenceRelevance}=require('../src/services/evidenceEvaluator');
const {guardEvidence}=require('../src/services/evidenceGuard');
const {computeExplainableTrustScore}=require('../src/services/explainableScoringService');
const {extractQuotesAndAttributions}=require('../src/services/entityIntentService');
const {evaluateSourceIntelligence,deriveFreshness}=require('../src/services/sourceIntelligence');
const {cleanHtml}=require('../src/services/inputReader');
async function run(){
const locationOnly=require('../src/services/factVerifier');
const locationQueries=locationOnly.generateMultiPerspectiveQueries(locationOnly.buildSearchRepresentation({text:'The PG had eight rooms and 16 beds.',entities:[],claimMeaning:{location:'Satya Niketan',quantities:['eight rooms','16 beds']}}));
assert(locationQueries.some(q=>q.strategy==='metric_context'&&q.query.includes('Satya Niketan')));
assert.equal(guardEvidence({text:'Hostel Daze has seven facilities.'},{snippet:'Hostel Daze operates 7 PGs.'},{stance:'SUPPORTS'}).stance,'SUPPORTS');

const {generateMultiPerspectiveQueries,buildSearchRepresentation}=require('../src/services/factVerifier');
const planned=generateMultiPerspectiveQueries(buildSearchRepresentation({text:'The Satya Niketan PG had eight rooms and 16 beds across four floors.',entities:['Satya Niketan']}));
assert(planned.some(q=>q.strategy==='metric_context' && q.query.includes('room') && q.query.includes('bed')));
assert(planned[0].query.includes('eight rooms and 16 beds'));

const {calculateEvidenceConfidence}=require('../src/services/evidenceConfidence');
const good={domain:'news.test',syndicationGroup:'publisher',stance:'SUPPORTS',authorityScore:90};
assert.deepEqual(calculateEvidenceConfidence([good]),calculateEvidenceConfidence([good,{...good,url:'https://news.test/copy'}]));
assert.equal(extractQuotesAndAttributions('“The owners knew the risk,” a senior police officer said.')[0].hasAttributedSpeaker,true);

assert.equal(normalizeEvidenceRelevance(0.95),95);assert.equal(normalizeEvidenceRelevance(95),95);assert.equal(normalizeEvidenceRelevance(0),0);
const c={text:'The Hostel Daze chain has seven facilities in Satya Niketan.',claimMeaning:{subject:'Hostel Daze chain',predicate:'has',object:'seven facilities',quantities:['seven facilities'],location:'Satya Niketan'}};
const unrelated={url:'https://news.test/story',title:'Hostel Daze collapse',snippet:'A building named Hostel Daze collapsed in Satya Niketan.'};
assert.notEqual((await evaluateEvidenceBatch(c,[unrelated],{heuristicOnly:true})).evidenceEvaluations[0].stance,'SUPPORTS');
assert.equal(guardEvidence(c,unrelated,{stance:'SUPPORTS'}).stance,'NEUTRAL');
assert.equal(guardEvidence(c,{snippet:'Seven people died at Hostel Daze in Satya Niketan.'},{stance:'SUPPORTS'}).stance,'NEUTRAL');
assert.equal(guardEvidence(c,{snippet:c.text},{stance:'SUPPORTS'}).stance,'SUPPORTS');
assert.equal(guardEvidence({text:'The operator signed the liability waiver.'},{snippet:'The operator was arrested.'},{stance:'SUPPORTS',requiresCitation:true,allEssentialDetailsSupported:true,supportingPassage:'The operator signed the liability waiver.'}).stance,'NEUTRAL');
const quotes=extractQuotesAndAttributions("The building in Delhi's district fell. “The accused is with Hostel Daze,” said a senior police officer. “The building wouldn't bear the load,” said police.");
assert.equal(quotes.length,2);assert.equal(quotes[0].quoteText,'The accused is with Hostel Daze,');assert(quotes[0].hasAttributedSpeaker);assert(quotes[1].quoteText.includes("wouldn't"));
assert.equal(deriveFreshness(null),'UNKNOWN');assert.equal(evaluateSourceIntelligence({domain:'amp.news18.com'}).publication,'News18');assert.equal(evaluateSourceIntelligence({domain:'unknown.test'}).authorityKnown,false);
const source={domain:'a.test',url:'https://a.test/1',stance:'SUPPORTS',authorityScore:90,syndicationGroup:'ONE'};
const data={verifiedClaims:[{verdict:'VERIFIED',confidence:90,sources:[source]}]};
const base=computeExplainableTrustScore(data);const duplicate=computeExplainableTrustScore({verifiedClaims:[{...data.verifiedClaims[0],sources:[source,{...source,url:'https://a.test/2'}]}]});
assert.equal(base.factorScores.sourceAuthority.score,duplicate.factorScores.sourceAuthority.score);assert.equal(base.factorScores.independentCorroboration.score,duplicate.factorScores.independentCorroboration.score);
assert(!base.weights.evidenceFreshness);assert(!base.weights.provenanceQuality);
const dated=computeExplainableTrustScore({verifiedClaims:[{...data.verifiedClaims[0],articleContext:{date:'2026-09-09'},sources:[{...source,publishedAt:'2026-09-08'}]}],provenance:{originAnalysis:{originConfidence:55}}});
assert.equal(dated.factorScores.evidenceFreshness.score,100);assert.equal(dated.factorScores.provenanceQuality.score,55);
const unknown=computeExplainableTrustScore({verifiedClaims:[{verdict:'UNVERIFIED',sources:[]}]});assert.equal(unknown.evidenceCoverage,0);
const scenario=computeExplainableTrustScore({verifiedClaims:[{verdict:'VERIFIED',status:'TRUSTED',confidence:90,sources:[]}],skipSensitivity:true});assert.equal(unknown.sensitivity[0].impactScore,scenario.finalTrustScore-unknown.finalTrustScore);
const html='<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'NewsArticle',articleBody:'First article paragraph.\nAlso Read | Unrelated headline\nSecond article paragraph.'}]})+'</script>';
assert(!cleanHtml(html).includes('Unrelated'));assert(cleanHtml(html).includes('Second article'));
console.log('Evidence quality regressions passed: missing metrics, shared evaluator, citations, quotes, publisher aliases, duplicates, freshness, provenance, coverage and recalculated scenarios.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
