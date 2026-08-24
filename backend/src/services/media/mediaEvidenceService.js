const { verifyClaims } = require('../factVerifier');

/**
 * Media & Forensic Evidence Service
 * Connects forensic findings (hashes, tampering signals, C2PA claims, date anomalies, edit cuts)
 * directly into structured evidentiary items mapped to claims.
 */

/**
 * Maps forensic findings to claims with evidentiary relationships: SUPPORTS, CONTRADICTS, QUALIFIES
 */
function mapForensicFindingsToClaims(claims = [], forensicFindings = []) {
  if (!Array.isArray(claims) || claims.length === 0 || !Array.isArray(forensicFindings) || forensicFindings.length === 0) {
    return [];
  }

  const mappedEvidence = [];

  claims.forEach((claim, claimIdx) => {
    const claimText = (claim.text || claim.statement || '').toLowerCase();

    forensicFindings.forEach((finding, findingIdx) => {
      let relationship = finding.stance || 'QUALIFIES';
      let relevanceScore = 80;

      // Match finding relevance based on claim topic
      const isAuthenticityClaim = claimText.includes('authentic') || claimText.includes('real') || claimText.includes('official') || claimText.includes('genuine');
      const isDateLocationClaim = claimText.includes('dated') || claimText.includes('published') || claimText.includes('occurred') || claimText.includes('event');
      const isImageClaim = claimText.includes('image') || claimText.includes('photo') || claimText.includes('picture');
      const isVideoClaim = claimText.includes('video') || claimText.includes('clip') || claimText.includes('speech');
      const isDocClaim = claimText.includes('circular') || claimText.includes('notice') || claimText.includes('order') || claimText.includes('letter');

      if (finding.findingType === 'C2PA_CONTENT_CREDENTIALS' && isAuthenticityClaim) {
        relationship = 'SUPPORTS';
        relevanceScore = 95;
      } else if ((finding.findingType === 'COPY_MOVE_CLONE_DETECTED' || finding.findingType === 'PDF_INCREMENTAL_EDIT_TAMPERING') && isAuthenticityClaim) {
        relationship = 'CONTRADICTS';
        relevanceScore = 95;
      } else if (finding.findingType === 'REVERSE_IMAGE_FIRST_APPEARANCE' && isDateLocationClaim) {
        relationship = 'QUALIFIES';
        relevanceScore = 90;
      }

      mappedEvidence.push({
        id: `forensic_ev_${claimIdx + 1}_${findingIdx + 1}`,
        claimId: claim.id || `claim_${claimIdx + 1}`,
        claimText: claim.text || claim.statement,
        findingType: finding.findingType,
        stance: relationship,
        relationship,
        evidenceType: 'FORENSIC_ANALYSIS',
        relevanceScore,
        confidence: finding.confidence || 85,
        description: finding.description,
        source: 'ETRAI Media Forensics Engine',
        domain: 'forensics.etrai.local',
        isIndependent: true,
        reason: finding.description
      });
    });
  });

  return mappedEvidence;
}

/**
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

  const verifiedList = await verifyClaims(claims, options, articleContext);
  const verifiedClaims = Array.isArray(verifiedList) ? verifiedList : (verifiedList.verifiedClaims || []);

  return {
    verifiedClaims,
    overallEvidenceState: verifiedClaims.some(c => c.verdict === 'VERIFIED' || c.status === 'TRUSTED') ? 'SUPPORTED' : 'INSUFFICIENT',
    limitations: []
  };
}

module.exports = {
  verifyMediaClaims,
  mapForensicFindingsToClaims
};
