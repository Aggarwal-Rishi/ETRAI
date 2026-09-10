import React from 'react';

export default function ClaimGroupSummary({ claim, claims }) {
  const group = claim.claimGroup;
  if (!group) return null;
  const members = claims.filter(item => item.claimGroup?.id === group.id);
  if (members[0] !== claim) return null;
  const counts = { supported: 0, contradicted: 0, partial: 0, unverified: 0 };
  for (const item of members) {
    const verdict = item.verdict || item.claimVerificationResult?.verdict || item.status;
    if (['VERIFIED', 'TRUSTED', 'SUPPORTED'].includes(verdict)) counts.supported++;
    else if (['FALSE', 'FABRICATED', 'REFUTED'].includes(verdict)) counts.contradicted++;
    else if (['PARTIALLY_VERIFIED', 'MIXED', 'DISPUTED'].includes(verdict)) counts.partial++;
    else counts.unverified++;
  }
  const verdict = counts.supported === members.length ? 'Supported'
    : counts.contradicted === members.length ? 'Contradicted'
    : counts.supported || counts.partial || counts.contradicted ? 'Mixed findings' : 'Unverified';
  return <div className="p-4 sm:p-5 bg-[#EAF1FC] border-b border-[#C7D5EB] space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-[#0B5CD5]">Claim group · {group.topic || 'Related facts'}</h4>
      <span className="text-xs font-semibold text-[#2C4E86]">{verdict}</span>
    </div>
    <p className="text-sm sm:text-base leading-relaxed text-[#253B5B] whitespace-pre-line break-words">{group.text}</p>
    <p className="text-xs text-[#2C4E86]">{members.length} factual {members.length === 1 ? 'detail' : 'details'} checked separately · {counts.supported} supported · {counts.contradicted} contradicted · {counts.partial} partially supported · {counts.unverified} unverified</p>
  </div>;
}
