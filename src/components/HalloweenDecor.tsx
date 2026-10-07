import React from 'react';

// Purely decorative Halloween layer for the clock-in screen. Drawn with inline
// SVG + CSS (see app.css "Halloween" section) so there are no image downloads.

const Bat: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 100 32" aria-hidden="true">
    <g fill="currentColor">
      <path d="M52 13 C60 5 74 1 94 5 C87 8 85 12 86 17 C81 14 76 15 73 19 C70 16 65 16 61 19 C59 17 56 17 52 19 Z" />
      <path d="M48 13 C40 5 26 1 6 5 C13 8 15 12 14 17 C19 14 24 15 27 19 C30 16 35 16 39 19 C41 17 44 17 48 19 Z" />
      <ellipse cx="50" cy="16" rx="4.5" ry="7" />
      <path d="M46.5 11 L47.5 5 L50 9.5 L52.5 5 L53.5 11 Z" />
    </g>
  </svg>
);

const Pumpkin: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 120 100" aria-hidden="true">
    <defs>
      <radialGradient id="pumpkinBody" cx="45%" cy="40%" r="65%">
        <stop offset="0%" stopColor="#fdba74" />
        <stop offset="55%" stopColor="#f97316" />
        <stop offset="100%" stopColor="#9a3412" />
      </radialGradient>
      <filter id="pumpkinGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <path d="M56 24 C55 14 59 7 66 4 L69 8 C64 11 62 16 63 24 Z" fill="#65a30d" />
    <ellipse cx="60" cy="60" rx="54" ry="37" fill="url(#pumpkinBody)" />
    <ellipse cx="60" cy="60" rx="20" ry="37" fill="none" stroke="#c2410c" strokeWidth="2" opacity="0.6" />
    <ellipse cx="60" cy="60" rx="38" ry="37" fill="none" stroke="#c2410c" strokeWidth="2" opacity="0.45" />
    <g className="pumpkin-face" fill="#fde047" filter="url(#pumpkinGlow)">
      <polygon points="34,54 45,38 54,54" />
      <polygon points="66,54 75,38 86,54" />
      <polygon points="56,62 60,55 64,62" />
      <path d="M28 67 Q60 95 92 67 L84 70 L79 64 L71 73 L64 66 L56 73 L49 66 L41 73 L36 64 Z" />
    </g>
  </svg>
);

const Ghost: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 60 70" aria-hidden="true">
    <path
      d="M6 66 V28 a24 24 0 0 1 48 0 V66 l-8 -7 -8 7 -7 -7 -7 7 -8 -7 z"
      fill="rgba(255,255,255,0.92)"
    />
    <ellipse cx="22" cy="30" rx="4" ry="6" fill="#1e1b4b" />
    <ellipse cx="38" cy="30" rx="4" ry="6" fill="#1e1b4b" />
    <ellipse cx="30" cy="44" rx="5" ry="4" fill="#1e1b4b" />
  </svg>
);

// Corner spider web: radial threads plus sagging rings, computed once
const SpiderWeb: React.FC<{ className?: string }> = ({ className }) => {
  const size = 220;
  const spokes = [0, 15, 32, 50, 68, 90].map(d => (d * Math.PI) / 180);
  const point = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r];
  const rings = [45, 90, 135, 180].map(r => {
    let d = '';
    spokes.forEach((a, i) => {
      const [x, y] = point(a, r);
      if (i === 0) {
        d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        const mid = (spokes[i - 1] + a) / 2;
        const [cx, cy] = point(mid, r * 0.82);
        d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    });
    return d;
  });
  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g stroke="rgba(226,232,240,0.35)" strokeWidth="1.2" fill="none">
        {spokes.map((a, i) => {
          const [x, y] = point(a, size * 1.05);
          return <line key={i} x1="0" y1="0" x2={x} y2={y} />;
        })}
        {rings.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
};

const HalloweenDecor: React.FC = () => (
  <div className="halloween-decor" aria-hidden="true">
    <div className="hd-stars" />
    <div className="hd-moon" />
    <SpiderWeb className="hd-web" />
    <div className="hd-spider">
      <span className="hd-spider-thread" />
      <span className="hd-spider-body">🕷️</span>
    </div>
    <Bat className="hd-bat hd-bat-1" />
    <Bat className="hd-bat hd-bat-2" />
    <Bat className="hd-bat hd-bat-3" />
    <Ghost className="hd-ghost" />
    <Pumpkin className="hd-pumpkin hd-pumpkin-left" />
    <Pumpkin className="hd-pumpkin hd-pumpkin-right" />
    <div className="hd-fog hd-fog-1" />
    <div className="hd-fog hd-fog-2" />
  </div>
);

export default HalloweenDecor;
