import React from 'react';

// Purely decorative Thanksgiving layer for the clock-in screen. Drawn with
// inline SVG + CSS (see app.css "Thanksgiving" section), no image downloads.

const MAPLE = 'M50 4 L57 24 L71 16 L67 37 L87 31 L78 47 L95 55 L74 60 L79 76 L59 67 L54 84 L50 70 L46 84 L41 67 L21 76 L26 60 L5 55 L22 47 L13 31 L33 37 L29 16 L43 24 Z';
const OAK = 'M50 6 C62 14 58 24 66 28 C76 30 70 42 76 48 C84 54 72 62 74 70 C76 80 60 78 56 86 L50 94 L44 86 C40 78 24 80 26 70 C28 62 16 54 24 48 C30 42 24 30 34 28 C42 24 38 14 50 6 Z';

const Leaf: React.FC<{ shape: 'maple' | 'oak'; color: string }> = ({ shape, color }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d={shape === 'maple' ? MAPLE : OAK} fill={color} />
    <path d="M50 30 L50 98" stroke="rgba(66, 32, 6, 0.55)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// left %, size px, fall seconds, delay seconds, color, shape
const LEAVES: [number, number, number, number, string, 'maple' | 'oak'][] = [
  [4, 34, 14, -2, '#dc2626', 'maple'],
  [13, 24, 18, -9, '#f59e0b', 'oak'],
  [22, 30, 16, -5, '#ea580c', 'maple'],
  [31, 22, 20, -14, '#b45309', 'oak'],
  [42, 28, 15, -11, '#f97316', 'maple'],
  [53, 20, 19, -3, '#facc15', 'oak'],
  [61, 32, 17, -7, '#b91c1c', 'maple'],
  [70, 24, 21, -16, '#d97706', 'oak'],
  [79, 30, 14, -10, '#ea580c', 'maple'],
  [88, 22, 18, -1, '#ca8a04', 'oak'],
  [95, 28, 16, -12, '#dc2626', 'maple'],
  [47, 18, 22, -19, '#fb923c', 'maple']
];

const Turkey: React.FC<{ className?: string }> = ({ className }) => {
  const feathers = [-72, -48, -24, 0, 24, 48, 72];
  const colors = ['#92400e', '#d97706', '#b45309', '#c2410c', '#b45309', '#d97706', '#92400e'];
  return (
    <svg className={className} viewBox="0 0 120 112" aria-hidden="true">
      <g>
        {feathers.map((a, i) => (
          <g key={a} transform={`rotate(${a} 60 66)`}>
            <ellipse cx="60" cy="30" rx="12" ry="32" fill={colors[i]} />
            <ellipse cx="60" cy="10" rx="8" ry="10" fill="#fde68a" opacity="0.55" />
          </g>
        ))}
      </g>
      <ellipse cx="60" cy="74" rx="27" ry="29" fill="#78350f" />
      <ellipse cx="41" cy="78" rx="9" ry="17" fill="#5b2a0a" transform="rotate(18 41 78)" />
      <ellipse cx="79" cy="78" rx="9" ry="17" fill="#5b2a0a" transform="rotate(-18 79 78)" />
      <circle cx="60" cy="46" r="14" fill="#92400e" />
      <circle cx="55" cy="42" r="4" fill="#fff" />
      <circle cx="65" cy="42" r="4" fill="#fff" />
      <circle cx="55.5" cy="42.5" r="2" fill="#1c1917" />
      <circle cx="64.5" cy="42.5" r="2" fill="#1c1917" />
      <polygon points="56,48 64,48 60,55" fill="#f59e0b" />
      <path d="M62 51 q6 4 3 13 q-5 -2 -4 -11 z" fill="#dc2626" />
      <g stroke="#f59e0b" strokeWidth="3" strokeLinecap="round">
        <path d="M52 101 L50 110 M50 110 l-4 1 M50 110 l3 1" />
        <path d="M68 101 L70 110 M70 110 l-3 1 M70 110 l4 1" />
      </g>
    </svg>
  );
};

// Three wheat stalks, grains placed in alternating pairs along each head
const Wheat: React.FC<{ className?: string }> = ({ className }) => {
  const stalks = [
    { x: 30, lean: -14, top: 18 },
    { x: 44, lean: 0, top: 6 },
    { x: 58, lean: 14, top: 22 }
  ];
  return (
    <svg className={className} viewBox="0 0 90 200" aria-hidden="true">
      {stalks.map(({ x, lean, top }) => {
        const tipX = x + lean;
        const grains = [0, 1, 2, 3, 4, 5].map(i => {
          const t = i / 6;
          const gx = tipX - lean * t * 0.35;
          const gy = top + 8 + i * 9;
          return (
            <g key={i}>
              <ellipse cx={gx - 4} cy={gy} rx="3.2" ry="6.5" fill="#eab308" transform={`rotate(-28 ${gx - 4} ${gy})`} />
              <ellipse cx={gx + 4} cy={gy} rx="3.2" ry="6.5" fill="#ca8a04" transform={`rotate(28 ${gx + 4} ${gy})`} />
            </g>
          );
        });
        return (
          <g key={x}>
            <path d={`M${x} 200 Q${x + lean * 0.2} 120 ${tipX} ${top}`} stroke="#a16207" strokeWidth="2.5" fill="none" />
            <ellipse cx={tipX} cy={top + 2} rx="3" ry="6" fill="#facc15" />
            {grains}
          </g>
        );
      })}
    </svg>
  );
};

const HarvestPumpkin: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 120 100" aria-hidden="true">
    <defs>
      <radialGradient id="harvestPumpkin" cx="45%" cy="40%" r="65%">
        <stop offset="0%" stopColor="#fdba74" />
        <stop offset="55%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#7c2d12" />
      </radialGradient>
    </defs>
    <path d="M56 24 C55 14 59 7 66 4 L69 8 C64 11 62 16 63 24 Z" fill="#4d7c0f" />
    <path d="M66 14 C76 6 88 10 90 18 C82 14 74 16 68 20 Z" fill="#65a30d" />
    <ellipse cx="60" cy="60" rx="54" ry="37" fill="url(#harvestPumpkin)" />
    <ellipse cx="60" cy="60" rx="20" ry="37" fill="none" stroke="#9a3412" strokeWidth="2" opacity="0.55" />
    <ellipse cx="60" cy="60" rx="38" ry="37" fill="none" stroke="#9a3412" strokeWidth="2" opacity="0.4" />
  </svg>
);

const ThanksgivingDecor: React.FC = () => (
  <div className="holiday-decor thanksgiving-decor" aria-hidden="true">
    <div className="td-sun" />
    <svg className="td-hills" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 90 C180 40 330 120 520 80 C700 42 860 110 1040 70 C1110 55 1160 60 1200 66 V160 H0 Z" fill="rgba(124, 45, 18, 0.55)" />
      <path d="M0 120 C220 90 380 140 600 112 C820 86 980 138 1200 108 V160 H0 Z" fill="rgba(67, 20, 7, 0.85)" />
    </svg>
    {LEAVES.map(([left, size, dur, delay, color, shape], i) => (
      <span
        key={i}
        className="td-leaf"
        style={{ left: `${left}%`, width: size, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
      >
        <span className="td-leaf-sway" style={{ animationDuration: `${3 + (i % 3)}s` }}>
          <Leaf shape={shape} color={color} />
        </span>
      </span>
    ))}
    <Wheat className="td-wheat td-wheat-left" />
    <Wheat className="td-wheat td-wheat-right" />
    <Turkey className="td-turkey" />
    <HarvestPumpkin className="td-pumpkin td-pumpkin-left" />
    <HarvestPumpkin className="td-pumpkin td-pumpkin-right" />
  </div>
);

export default ThanksgivingDecor;
