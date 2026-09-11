import React from 'react';
import { useTheme } from '../context/ThemeContext';

const STAR_POSITIONS = [
  { left: 13, top: 6, size: 2, delay: '0s' },
  { left: 24, top: 23, size: 1.5, delay: '0.5s' },
  { left: 18, top: 14, size: 2.5, delay: '1s' },
  { left: 8, top: 25, size: 1.5, delay: '1.6s' },
  { left: 29, top: 10, size: 1.5, delay: '2.1s' },
];

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleClick = (e) => {
    toggleTheme();
    // restart the ripple animation on every click
    const ripple = e.currentTarget.querySelector('.theme-toggle__ripple');
    if (ripple) {
      ripple.classList.remove('animate');
      // eslint-disable-next-line no-unused-expressions
      void ripple.offsetWidth;
      ripple.classList.add('animate');
    }
  };

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      data-theme={theme}
      onClick={handleClick}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="horizon" aria-hidden="true" />
      <span className="aurora" aria-hidden="true" />

      <span className="cloud c1" aria-hidden="true" />
      <span className="cloud c2" aria-hidden="true" />

      <span className="theme-toggle__stars" aria-hidden="true">
        {STAR_POSITIONS.map((pos, i) => (
          <span
            key={i}
            className="theme-toggle__star"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.size,
              height: pos.size,
              animationDelay: pos.delay,
            }}
          />
        ))}
      </span>
      <span className="shooting-star" aria-hidden="true" />

      <span className="theme-toggle__ripple" aria-hidden="true" />

      <span className="theme-toggle__thumb">
        <span className="sun-rays" aria-hidden="true">
          {RAY_ANGLES.map((angle) => (
            <span
              key={angle}
              style={{ transform: `rotate(${angle}deg) translateY(-16px)` }}
            />
          ))}
        </span>
        <span className="crater c1" aria-hidden="true" />
        <span className="crater c2" aria-hidden="true" />
        <span className="crater c3" aria-hidden="true" />
        <span className="crater c4" aria-hidden="true" />
      </span>
    </button>
  );
}
