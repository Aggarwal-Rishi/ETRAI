require('dotenv').config();
const { extractClaims } = require('../src/services/claimExtractor');
const { verifyClaims } = require('../src/services/factVerifier');

const SAMPLE_ARTICLES = [
  {
    name: "Tea Farmer Abduction Case (Regional/Local)",
    text: `COOCH BEHAR / JALPAIGURI: A 34-year-old tea garden worker named Samar Roy was allegedly abducted from a tea plantation field near the India-Bangladesh border in Cooch Behar district, West Bengal, on Tuesday evening. According to local police and Border Security Force (BSF) officials, four unidentified masked men on motorcycles forced Roy across the border into Lalmonirhat district of Bangladesh. Cooch Behar Superintendent of Police Dyutiman Bhattacharya stated that an FIR has been registered at Boxirhat Police Station and cross-border flag meetings with Border Guard Bangladesh (BGB) are underway. Local tea garden workers' union members staged a protest on Wednesday morning demanding heightened border security.`
  },
  {
    name: "Corporate/Tech Earnings (Financial/National)",
    text: `BENGALURU: Software giant Infosys announced a 11.4% year-on-year increase in net profit to ₹6,586 crore for the quarter ending June 30, 2026. The company's total revenue from operations rose 7.2% to ₹41,898 crore compared to ₹39,075 crore in the same period last year. Chief Executive Officer Salil Parekh announced that Infosys raised its full-year revenue growth guidance to 3%-4% in constant currency terms, citing strong demand in digital banking and cloud transformation services.`
  }
];

async function runDiagnostic() {
  console.log('================================================================');
  console.log('🚨 EMERGENCY DIAGNOSTIC TEST RUN: AGENT 2 & AGENT 3 SEARCHABILITY');
  console.log('================================================================\n');

  for (const article of SAMPLE_ARTICLES) {
    console.log(`\n📰 ARTICLE: ${article.name}`);
    console.log('----------------------------------------------------------------');
    
    // Step 1: Agent 2 Claim Extraction
    console.log('🤖 Running Agent 2 Claim Extraction...');
    const claims = await extractClaims(article.text);
    console.log(`Extracted ${claims.length} claims:\n`);

    claims.forEach((c, idx) => {
      console.log(`  [Claim ${idx + 1}] ID: ${c.id}`);
      console.log(`    TEXT          : "${c.text}"`);
      console.log(`    SEARCH QUERY  : "${c.searchQuery}"`);
      console.log(`    CATEGORY      : ${c.category} | SCOPE: ${c.claimScope} | SCORE: ${c.importanceScore}`);
      console.log(`    ENTITIES      : ${JSON.stringify(c.entities)}`);
      console.log(`    ARTICLE CONTEXT: ${JSON.stringify(c.articleContext)}`);
      
      // Diagnostics checks on claim quality
      const isShort = c.text.split(' ').length < 8;
      const lacksLocation = !c.text.toLowerCase().includes('cooch behar') && !c.text.toLowerCase().includes('west bengal') && !c.text.toLowerCase().includes('bengaluru') && !c.text.toLowerCase().includes('india') && !c.text.toLowerCase().includes('bangladesh');
      const hasUnresolvedPronouns = /\b(he|she|they|it|this person|the worker|the company|the police|the incident)\b/i.test(c.text.substring(0, 15));

      if (isShort || lacksLocation || hasUnresolvedPronouns) {
        console.log(`    ⚠️ QUALITY WARNING: ${isShort ? '[TOO SHORT] ' : ''}${lacksLocation ? '[MISSING LOCATION CONTEXT] ' : ''}${hasUnresolvedPronouns ? '[UNRESOLVED PRONOUN/SUBJECT] ' : ''}`);
      } else {
        console.log(`    ✅ SEARCHABILITY PASS: Claim text appears context-rich and self-contained.`);
      }
      console.log('');
    });

    // Step 2: Agent 3 Verification
    console.log('🤖 Running Agent 3 Verification...');
    const verifiedResults = await verifyClaims(claims);
    
    verifiedResults.forEach((v, idx) => {
      console.log(`  [Verification ${idx + 1}] ID: ${v.claimId}`);
      console.log(`    VERDICT     : ${v.status} (${v.confidence}%)`);
      console.log(`    EXPLANATION : "${v.explanation}"`);
      console.log(`    WEB QUERY   : "${v.auditTrail?.searchQueries?.webQuery}"`);
      console.log(`    HITS COUNT  : ${v.auditTrail?.rawSearchHits?.webHitsCount || 0}`);
      console.log(`    SUPPORT IND : ${JSON.stringify(v.supportingSourceIndices)} | REFUTE IND: ${JSON.stringify(v.refutingSourceIndices)}`);
      console.log('');
    });
  }

  console.log('================================================================');
  console.log('🚨 DIAGNOSTIC TEST RUN COMPLETE');
  console.log('================================================================\n');
}

runDiagnostic().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
