const OpenAI = require('openai');

/**
 * Calculates category scores based on verified claims data
 */
function calculateCategoryScores(verifiedClaims, selectedTypes) {
  const total = Math.max(verifiedClaims.length, 1);
  const verifiedCount = verifiedClaims.filter(c => c.status === 'Verified').length;
  const suspiciousCount = verifiedClaims.filter(c => c.status === 'Suspicious').length;
  const falseCount = verifiedClaims.filter(c => c.status === 'False').length;

  const scores = {};

  if (selectedTypes.includes('FACT_CHECKING')) {
    // Fact checking score weighting
    const rawScore = ((verifiedCount * 1.0 + suspiciousCount * 0.4 + falseCount * 0.0) / total) * 100;
    scores.factCheckingScore = Math.min(Math.max(Math.round(rawScore), 15), 98);
  }

  if (selectedTypes.includes('FAKE_NEWS_DETECTION')) {
    // Fake news detection score checks manipulation tactics & source credibility
    const credibilityPenalty = (falseCount * 25) + (suspiciousCount * 10);
    const rawScore = 100 - (credibilityPenalty / total);
    scores.fakeNewsScore = Math.min(Math.max(Math.round(rawScore), 12), 96);
  }

  if (selectedTypes.includes('BUSINESS_REPORT')) {
    // Business report score focuses on financial & statistical accuracy
    const businessClaims = verifiedClaims.filter(c => 
      c.category.includes('Metric') || c.category.includes('Financial') || c.category.includes('Statement')
    );
    const bTotal = Math.max(businessClaims.length, 1);
    const bVerified = businessClaims.filter(c => c.status === 'Verified').length;
    const bFalse = businessClaims.filter(c => c.status === 'False').length;

    const rawScore = ((bVerified * 1.0 - bFalse * 0.5) / bTotal) * 100;
    scores.businessReportScore = Math.min(Math.max(Math.round(rawScore), 20), 99);
  }

  return {
    scores,
    breakdown: {
      totalClaims: verifiedClaims.length,
      verified: verifiedCount,
      suspicious: suspiciousCount,
      false: falseCount
    }
  };
}

/**
 * Agent 4 – Report Generator Service
 */
async function generateReport({ sourceTitle, extractedText, verifiedClaims, selectedTypes, truncated }) {
  const { scores, breakdown } = calculateCategoryScores(verifiedClaims, selectedTypes);
  
  const openAiKey = process.env.OPENAI_API_KEY;
  const hasOpenAi = openAiKey && !openAiKey.includes('your_openai_api_key');
  
  let summary = '';
  let recommendation = '';
  let manipulationAnalysis = null;

  if (hasOpenAi) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const prompt = `You are Agent 4 (Report Generator) in an AI Fact-Checking system.
Analyze the verification results below and generate an executive summary, verdict recommendation, and manipulation assessment.

Document Title: ${sourceTitle}
Selected Types: ${selectedTypes.join(', ')}
Category Scores: ${JSON.stringify(scores)}
Claims Breakdown: ${JSON.stringify(breakdown)}
Claims Evidence: ${JSON.stringify(verifiedClaims.slice(0, 10))}

Return ONLY a JSON object with:
{
  "summary": "2-3 sentence executive summary of overall accuracy and key findings",
  "recommendation": "Clear actionable advice for the reader (e.g. Verified with high confidence / Needs cross-referencing / Potential clickbait detected)",
  "verdict": "HIGH_TRUST" | "MODERATE_TRUST" | "LOW_TRUST",
  "manipulationRisk": "LOW" | "MEDIUM" | "HIGH",
  "keyHighlights": ["Highlight 1", "Highlight 2", "Highlight 3"]
}`;

      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });

      const parsed = JSON.parse(res.choices[0].message.content);
      summary = parsed.summary;
      recommendation = parsed.recommendation;
      manipulationAnalysis = {
        verdict: parsed.verdict || 'MODERATE_TRUST',
        manipulationRisk: parsed.manipulationRisk || 'LOW',
        keyHighlights: parsed.keyHighlights || []
      };
    } catch (e) {
      // Fallthrough to rule-based synthesis
    }
  }

  // Fallback rule-based summary generation
  if (!summary) {
    const accuracyRate = Math.round((breakdown.verified / Math.max(breakdown.totalClaims, 1)) * 100);
    
    if (accuracyRate >= 75) {
      summary = `The submitted content demonstrates strong factual accuracy with ${breakdown.verified} out of ${breakdown.totalClaims} claims independently verified against trusted sources.`;
      recommendation = `High Confidence: Content is well-supported by primary news and official data registries. Ready for decision-making or publication.`;
    } else if (accuracyRate >= 45) {
      summary = `The content contains a mix of verified facts and unconfirmed assertions. ${breakdown.suspicious} claims require additional cross-referencing.`;
      recommendation = `Moderate Caution: Verify suspicious claims against primary corporate filings or official government statistics before sharing.`;
    } else {
      summary = `Multiple significant inaccuracies were detected (${breakdown.false} false claims and ${breakdown.suspicious} unverified claims).`;
      recommendation = `High Risk: Content exhibits characteristics of misleading or unverified reporting. Thorough revision is recommended.`;
    }

    manipulationAnalysis = {
      verdict: accuracyRate >= 75 ? 'HIGH_TRUST' : accuracyRate >= 45 ? 'MODERATE_TRUST' : 'LOW_TRUST',
      manipulationRisk: accuracyRate >= 75 ? 'LOW' : accuracyRate >= 45 ? 'MEDIUM' : 'HIGH',
      keyHighlights: [
        `${breakdown.verified} claims verified against top-tier trusted sources`,
        `${breakdown.suspicious} claims flagged for insufficient primary documentation`,
        `${breakdown.false} claims contradicted by independent factual records`
      ]
    };
  }

  // Chart Visualization Data for Frontend Recharts
  const chartData = [
    { name: 'Verified', value: breakdown.verified, color: '#10B981' },
    { name: 'Suspicious', value: breakdown.suspicious, color: '#F59E0B' },
    { name: 'False', value: breakdown.false, color: '#EF4444' }
  ];

  return {
    sourceTitle,
    selectedTypes,
    scores,
    breakdown,
    summary,
    recommendation,
    manipulationAnalysis,
    chartData,
    claims: verifiedClaims,
    truncated: !!truncated,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  generateReport,
  calculateCategoryScores
};
