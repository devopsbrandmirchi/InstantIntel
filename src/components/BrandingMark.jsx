import React from 'react';

const rvPathFull =
  'M2 12h5l1.2-3.5h7V12h3.5l1.8-5.5H2V12zm1.5-6.5h12v1.5H3.5V5.5zm6.5 8a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0zm5.5 0a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z';

const rvPathCompact = 'M4 14h6l1.5-4h8v4h4l2-6H4v6zm2-8h14v2H6V6zm8 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z';

/**
 * Logo mark: optional teal plate + RV glyph + wordmark (Instant Intel RVS).
 * @param {{ compact?: boolean, variant?: 'dark' | 'light', showPlate?: boolean, className?: string }} props
 */
const BrandingMark = ({ compact = false, variant = 'dark', showPlate = true, className = '' }) => {
  const wordClass =
    variant === 'light'
      ? 'text-white'
      : 'text-brand-navy';
  const wordMutedClass =
    variant === 'light' ? 'text-white font-medium' : 'text-brand-navy/80 font-bold';
  const glyphFill = showPlate ? '#ffffff' : variant === 'light' ? '#ffffff' : '#1A334B';

  if (compact) {
    return (
      <svg
        className={className.trim()}
        viewBox="0 0 48 40"
        width="40"
        height="34"
        aria-hidden
      >
        {showPlate && (
          <defs>
            <linearGradient id="brandPlateCompact" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3da89f" />
              <stop offset="100%" stopColor="#2d8b84" />
            </linearGradient>
          </defs>
        )}
        {showPlate && <rect x="2" y="4" width="44" height="32" rx="6" fill="url(#brandPlateCompact)" />}
        <g fill={glyphFill} transform="translate(8, 10) scale(0.85)">
          <path d={rvPathCompact} />
        </g>
      </svg>
    );
  }

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 56 44"
        className="h-8 w-auto shrink-0 sm:h-10"
        aria-hidden
      >
        {showPlate && (
          <>
            <defs>
              <linearGradient id="brandPlateFull" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3da89f" />
                <stop offset="100%" stopColor="#2d8b84" />
              </linearGradient>
            </defs>
            <rect x="2" y="4" width="52" height="36" rx="8" fill="url(#brandPlateFull)" />
          </>
        )}
        <g fill={glyphFill} transform="translate(10, 12)">
          <path d={rvPathFull} />
        </g>
      </svg>
      <div className="leading-tight whitespace-nowrap">
        <div className={`text-[10px] font-extrabold tracking-wide uppercase sm:text-[11px] ${wordClass}`}>
          Instant Intel
        </div>
        <div className={`text-[9px] tracking-wider uppercase sm:text-[10px] ${wordMutedClass}`}>
          RVs
        </div>
      </div>
    </div>
  );
};

export default BrandingMark;
