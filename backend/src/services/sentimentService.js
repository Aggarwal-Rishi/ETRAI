const vader = require('vader-sentiment');

/**
 * Calculates VADER sentiment analysis for a given text
 * Returns compound score (-1.0 to +1.0), intensity (0.0 to 1.0), and label
 */
function analyzeSentiment(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      compound: 0,
      intensity: 0,
      label: 'Neutral',
      pos: 0,
      neg: 0,
      neu: 1
    };
  }

  try {
    const intensityScores = vader.SentimentIntensityAnalyzer.polarity_scores(text);
    const compound = intensityScores.compound;
    const intensity = Math.min(1.0, Math.max(0.0, Math.abs(compound)));

    let label = 'Neutral';
    if (compound >= 0.25) label = 'Positive';
    else if (compound <= -0.25) label = 'Negative';

    return {
      compound,
      intensity: Number(intensity.toFixed(3)),
      label,
      pos: intensityScores.pos,
      neg: intensityScores.neg,
      neu: intensityScores.neu
    };
  } catch (err) {
    console.warn('[Sentiment Service Error]:', err.message);
    return {
      compound: 0,
      intensity: 0,
      label: 'Neutral',
      pos: 0,
      neg: 0,
      neu: 1
    };
  }
}

/**
 * Cross-checks VADER sentiment intensity with GPT-4o assessed emotional intensity
 * Returns status flag and final intensity score
 */
function crossCheckSentiment(vaderIntensity, gptIntensity) {
  const gptVal = typeof gptIntensity === 'number' ? Math.min(1.0, Math.max(0.0, gptIntensity)) : vaderIntensity;
  const diff = Math.abs(vaderIntensity - gptVal);
  const isUncertain = diff > 0.4;

  // Use average intensity or higher intensity as baseline score
  const finalIntensity = Number(((vaderIntensity + gptVal) / 2).toFixed(3));

  return {
    vaderIntensity,
    gptIntensity: gptVal,
    difference: Number(diff.toFixed(3)),
    isUncertain,
    sentimentStatus: isUncertain ? 'uncertain' : 'confirmed',
    finalIntensity
  };
}

module.exports = {
  analyzeSentiment,
  crossCheckSentiment
};
