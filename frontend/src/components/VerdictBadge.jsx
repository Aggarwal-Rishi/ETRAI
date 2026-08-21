import React from 'react';

/**
 * DeepTrust Standard Status Washes & Verdict Badge Component
 * 
 * Status Categories:
 * - 'verified' | 'real' | 'supported'   -> moss-wash (#E4EFE7), text: #2C5B3E, border: #C6DFCF
 * - 'suspicious' | 'questionable'      -> ochre-wash (#F7EEDA), text: #8A6212, border: #EBD9AE
 * - 'fake' | 'false' | 'refuted'       -> brick-wash (#F7E3E0), text: #8E2F27, border: #EBC7C2
 * - 'unverified' | 'neutral' | 'noted' -> slate-wash (#E9ECF0), text: #4C596A, border: #D3D9E1
 * - 'clay' | 'run'                     -> clay-wash (#F6E7DF), text: #B0512F, border: #EFD3C6
 */

export function getStatusStyle(status = 'neutral') {
  const norm = String(status).toLowerCase().trim();

  if (['verified', 'real', 'true', 'supported', 'active', 'paid', 'clean'].includes(norm)) {
    return {
      bg: 'bg-moss-wash',
      text: 'text-moss-text',
      border: 'border-moss-border',
      dot: 'bg-[#2C5B3E]',
      label: 'Verified Real'
    };
  }

  if (['suspicious', 'susp', 'questionable', 'partly true', 'caution', 'warn'].includes(norm)) {
    return {
      bg: 'bg-ochre-wash',
      text: 'text-ochre-text',
      border: 'border-ochre-border',
      dot: 'bg-[#8A6212]',
      label: 'Suspicious'
    };
  }

  if (['fake', 'false', 'refuted', 'fabricated', 'manipulated', 'flagged', 'danger'].includes(norm)) {
    return {
      bg: 'bg-brick-wash',
      text: 'text-brick-text',
      border: 'border-brick-border',
      dot: 'bg-[#8E2F27]',
      label: 'Flagged Fake'
    };
  }

  if (['clay', 'run', 'lead', 'action'].includes(norm)) {
    return {
      bg: 'bg-clay-wash',
      text: 'text-clay-deep',
      border: 'border-[#EFD3C6]',
      dot: 'bg-[#B0512F]',
      label: 'Run DeepTrust'
    };
  }

  // Default: Neutral / Unverified
  return {
    bg: 'bg-slateWash-wash',
    text: 'text-slateWash-text',
    border: 'border-slateWash-border',
    dot: 'bg-[#4C596A]',
    label: 'Unverified'
  };
}

export default function VerdictBadge({
  status = 'neutral',
  label = null,
  showDot = true,
  size = 'md', // 'sm' | 'md' | 'lg'
  className = ''
}) {
  const style = getStatusStyle(status);
  const displayLabel = label !== null ? label : style.label;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[9.5px]',
    md: 'px-2.5 py-1 text-[10.5px]',
    lg: 'px-3.5 py-1.5 text-xs font-semibold'
  }[size] || 'px-2.5 py-1 text-[10.5px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono uppercase tracking-wider font-semibold border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
