const { verifyClaims } = require('../factVerifier');

/**
 * Media Evidence Service
 * Verifies extracted media claims against real search results and independent evidence archives.
 */
async function verifyMediaClaims(claims = [], articleContext = {}, options = {}) {
  if (Array.isArray(options.mockVerifiedClaims)) {
    return {
      verifiedClaims: options.mockVerifiedClaims,
      overallEvidenceState: 'SUPPORTED',
      limitations: []
    };
  }

  if (!Array.isArray(claims) || claims.length === 0) {
    return {
      verifiedClaims: [],
      overallEvidenceState: 'INSUFFICIENT',
      limitations: ['No extracted claims available to verify']
    };
  }

  // Pass options as 2nd argument (customThresholds / optionsObj) to verifyClaims
  const verifiedList = await verifyClaims(claims, options, articleContext);
  const verifiedClaims = Array.isArray(verifiedList) ? verifiedList : (verifiedList.verifiedClaims || []);

  return {
    verifiedClaims,
    overallEvidenceState: verifiedClaims.some(c => c.verdict === 'VERIFIED' || c.status === 'TRUSTED') ? 'SUPPORTED' : 'INSUFFICIENT',
    limitations: []
  };
}

module.exports = {
  verifyMediaClaims
};
