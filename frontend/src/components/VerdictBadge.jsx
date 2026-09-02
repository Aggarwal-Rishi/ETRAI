import React from 'react';

/**
 * ETRAI Standard Verdict & Status Badge Component (Sleek Dark Theme)
 */

export function getStatusStyle(status = 'neutral') {
  const norm = String(status).toLowerCase().trim();

  if (['verified', 'real', 'true', 'supported'].includes(norm)) {
    return {
      bg: 'bg-[#E4EFE7]',
      text: 'text-[#2C5B3E]',
      border: 'border-[#C5DEC9]',
      dot: 'bg-[#2C5B3E]',
      label: 'Verified'
    };
  }

  if (norm === 'completed') {
    return { bg: 'bg-[#E4EFE7]', text: 'text-[#2C5B3E]', border: 'border-[#C5DEC9]', dot: 'bg-[#2C5B3E]', label: 'Completed' };
  }
  if (norm === 'active') {
    return { bg: 'bg-[#E4EFE7]', text: 'text-[#2C5B3E]', border: 'border-[#C5DEC9]', dot: 'bg-[#2C5B3E]', label: 'Active' };
  }
  if (norm === 'paid') {
    return { bg: 'bg-[#E4EFE7]', text: 'text-[#2C5B3E]', border: 'border-[#C5DEC9]', dot: 'bg-[#2C5B3E]', label: 'Paid' };
  }
  if (norm === 'clean') {
    return { bg: 'bg-[#E4EFE7]', text: 'text-[#2C5B3E]', border: 'border-[#C5DEC9]', dot: 'bg-[#2C5B3E]', label: 'Clean' };
  }

  if (['partly true', 'partially_verified'].includes(norm)) {
    return {
      bg: 'bg-[#F7EEDA]',
      text: 'text-[#B98520]',
      border: 'border-[#E8D4B0]',
      dot: 'bg-[#B98520]',
      label: 'Partially Verified'
    };
  }

  if (['suspicious', 'susp', 'questionable', 'caution', 'warn'].includes(norm)) {
    return {
      bg: 'bg-[#F7EEDA]',
      text: 'text-[#B98520]',
      border: 'border-[#E8D4B0]',
      dot: 'bg-[#B98520]',
      label: 'Suspicious'
    };
  }

  if (['fake', 'false', 'refuted', 'fabricated', 'manipulated', 'flagged', 'danger'].includes(norm)) {
    return {
      bg: 'bg-[#F7E3E0]',
      text: 'text-[#B23F35]',
      border: 'border-[#EBC7C2]',
      dot: 'bg-[#B23F35]',
      label: 'Flagged Fake'
    };
  }

  // Default: Neutral / Unverified
  return {
    bg: 'bg-[#EFEEE9]',
    text: 'text-[#0B5CD5]',
    border: 'border-[#CECECE]',
    dot: 'bg-[#7386A8]',
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
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-[11px]',
    lg: 'px-3.5 py-1.5 text-xs font-semibold'
  }[size] || 'px-2.5 py-1 text-[11px]';

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
