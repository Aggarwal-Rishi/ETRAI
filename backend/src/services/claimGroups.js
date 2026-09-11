// Keep display/search groups separate from individually adjudicated assertions.
const textOf = claim => claim.resolvedText || claim.claimText || claim.text || '';
const unique = values => [...new Set(values.filter(Boolean))];

function subjectRewriteWarning(claim) {
  // An object's relative-clause event must not be reassigned to its owner/operator.
  const original = claim.originalText || claim.sourceContext?.originalSentence || '';
  const relative = original.match(/^((?:the|a|an)\s+(?:owner|operator|manager|director|employee)\s+of\s+.+?),\s*which\s+(collapsed|burned|exploded|was demolished)\b/i);
  if (!relative) return null;
  const normalize = text => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normalize(textOf(claim)).startsWith(normalize(`${relative[1]} ${relative[2]}`))) {
    return 'The extracted wording may assign an event involving a property to its owner or operator. Review the original passage before verifying this detail.';
  }
  return null;
}

function groupClaims(claims = []) {
  const groups = [], explicitGroups = new Map();
  for (const claim of claims) {
    const explicit = typeof claim.groupId === 'string' && claim.groupId.trim();
    let group = explicit ? explicitGroups.get(explicit) : null;
    const previous = groups.at(-1);
    if (!explicit && previous) {
      const last = previous.members.at(-1);
      const sameParagraph = claim.sourceContext?.paragraph && claim.sourceContext.paragraph === last.sourceContext?.paragraph;
      const subject = claim.claimMeaning?.subject;
      const sameSubject = subject && subject === last.claimMeaning?.subject;
      const entities = unique([...(claim.entities || []), ...(claim.claimMeaning?.entities || [])]);
      const sharedEntity = entities.some(e => [...(last.entities || []), ...(last.claimMeaning?.entities || [])].includes(e));
      if (sameParagraph && (sameSubject || sharedEntity || claim.originalText === last.originalText)) group = previous;
    }
    if (!group) {
      group = { id: `group_${groups.length + 1}`, topic: claim.groupTopic || 'Related facts', members: [] };
      groups.push(group);
      if (explicit) explicitGroups.set(explicit, group);
    }
    group.members.push(claim);
  }
  const ordered = groups.flatMap(group => {
    // Compose from the extracted assertions, never a second invented summary.
    const text = unique(group.members.map(c => subjectRewriteWarning(c) ? (c.originalText || c.sourceContext.originalSentence) : textOf(c))).join(' ');
    const assertionIds = group.members.map(c => c.id || c.claimId);
    const claimGroup = { id: group.id, topic: group.topic, text, searchQuery: text, assertionIds };
    return group.members.map(claim => {
      const { groupId, groupTopic, ...rest } = claim;
      const extractionWarning = subjectRewriteWarning(claim);
      return { ...rest, claimGroup, ...(extractionWarning ? { extractionWarning, verifiability: 'requires_review' } : {}) };
    });
  });
  for (const key of Object.keys(claims).filter(key => !/^\d+$/.test(key))) ordered[key] = claims[key];
  return ordered;
}

function summarizeClaimGroups(claims = []) {
  const groups = new Map();
  claims.forEach((claim, index) => {
    if (!claim.claimGroup?.id) return;
    const meta = claim.claimGroup;
    if (!groups.has(meta.id)) groups.set(meta.id, { ...meta, assertionIndexes: [], counts: { supported: 0, contradicted: 0, partial: 0, unverified: 0 } });
    const group = groups.get(meta.id);
    group.assertionIndexes.push(index);
    const verdict = claim.verdict || claim.claimVerificationResult?.verdict || claim.status;
    if (['VERIFIED', 'TRUSTED', 'SUPPORTED'].includes(verdict)) group.counts.supported++;
    else if (['FALSE', 'FABRICATED', 'REFUTED'].includes(verdict)) group.counts.contradicted++;
    else if (['PARTIALLY_VERIFIED', 'MIXED', 'DISPUTED'].includes(verdict)) group.counts.partial++;
    else group.counts.unverified++;
  });
  return [...groups.values()].map(group => ({ ...group,
    verdict: group.counts.supported === group.assertionIndexes.length ? 'VERIFIED'
      : group.counts.contradicted === group.assertionIndexes.length ? 'FALSE'
      : group.counts.supported || group.counts.partial || group.counts.contradicted ? 'MIXED' : 'UNVERIFIED'
  }));
}
module.exports = { groupClaims, summarizeClaimGroups };
