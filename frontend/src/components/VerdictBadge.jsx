import React from 'react';

/**
 * ETRAI Standard Verdict & Status Badge Component (Sleek Dark Theme)
 */

export function getStatusStyle(status = 'neutral') {
  const norm = String(status).toLowerCase().trim();

  if (['verified', 'real', 'true', 'supported'].includes(norm)) {
    return {
      bg: 'bg-emerald-950/60',
      text: 'text-emerald-400',
      border: 'border-emerald-800/40',
      dot: 'bg-emerald-400',
      label: 'Verified'
    };
  }

  if (norm === 'completed') {
    return { bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-800/40', dot: 'bg-emerald-400', label: 'Completed' };
  }
  if (norm === 'active') {
    return { bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-800/40', dot: 'bg-emerald-400', label: 'Active' };
  }
  if (norm === 'paid') {
    return { bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-800/40', dot: 'bg-emerald-400', label: 'Paid' };
  }
  if (norm === 'clean') {
    return { bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-800/40', dot: 'bg-emerald-400', label: 'Clean' };
  }

  if (['partly true', 'partially_verified'].includes(norm)) {
    return {
      bg: 'bg-amber-950/60',
      text: 'text-amber-400',
      border: 'border-amber-800/40',
      dot: 'bg-amber-400',
      label: 'Partially Verified'
    };
  }

  if (['suspicious', 'susp', 'questionable', 'caution', 'warn'].includes(norm)) {
    return {
      bg: 'bg-amber-950/60',
      text: 'text-amber-400',
      border: 'border-amber-800/40',
      dot: 'bg-amber-400',
      label: 'Suspicious'
    };
  }

  if (['fake', 'false', 'refuted', 'fabricated', 'manipulated', 'flagged', 'danger'].includes(norm)) {
    return {
      bg: 'bg-rose-950/60',
      text: 'text-rose-400',
      border: 'border-rose-800/40',
      dot: 'bg-rose-400',
      label: 'Flagged Fake'
    };
  }

  // Default: Neutral / Unverified
  return {
    bg: 'bg-slate-900/80',
    text: 'text-slate-300',
    border: 'border-slate-800',
    dot: 'bg-slate-400',
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
