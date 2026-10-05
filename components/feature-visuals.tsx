/** Анимированные SVG-иллюстрации для блока «Что делаем». */

const dur = (s: number) => `${s}s`;

export function DeployVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <defs>
        <clipPath id="deployClip">
          <rect x="30" y="20" width="140" height="120" rx="4" />
        </clipPath>
      </defs>
      <rect x="30" y="20" width="140" height="120" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <g clipPath="url(#deployClip)">
        {[...Array(6)].map((_, i) => (
          <rect key={i} x="40" y={35 + i * 16} width="120" height="10" rx="2" fill="currentColor" opacity="0.15">
            <animate attributeName="opacity" values="0.15;0.8;0.15" dur="2s" begin={dur(i * 0.15)} repeatCount="indefinite" />
            <animate attributeName="width" values="20;120;20" dur="2s" begin={dur(i * 0.15)} repeatCount="indefinite" />
          </rect>
        ))}
      </g>
      <circle cx="100" cy="155" r="3" fill="currentColor" opacity="0.3">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function AiVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <circle cx="100" cy="80" r="12" fill="currentColor">
        <animate attributeName="r" values="12;14;12" dur="2s" repeatCount="indefinite" />
      </circle>
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = 100 + Math.cos(angle) * 50;
        const y = 80 + Math.sin(angle) * 50;
        return (
          <g key={i}>
            <line x1="100" y1="80" x2={x} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.3">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" begin={dur(i * 0.3)} repeatCount="indefinite" />
            </line>
            <circle cx={x} cy={y} r="6" fill="none" stroke="currentColor" strokeWidth="2">
              <animate attributeName="r" values="6;8;6" dur="2s" begin={dur(i * 0.3)} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
      <circle cx="100" cy="80" r="30" fill="none" stroke="currentColor" strokeWidth="1" opacity="0">
        <animate attributeName="r" values="20;60" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function CollabVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      {[
        { x: 30, label: "A" },
        { x: 120, label: "B" },
      ].map(({ x, label }) => (
        <g key={label}>
          <rect x={x} y="50" width="50" height="60" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <text x={x + 25} y="85" textAnchor="middle" fontSize="20" fontFamily="monospace" fill="currentColor">
            {label}
          </text>
          <circle cx={x + 25} cy="35" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
      ))}
      <line x1="80" y1="80" x2="120" y2="80" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" values="0;-8" dur="0.5s" repeatCount="indefinite" />
      </line>
      <circle r="4" fill="currentColor">
        <animateMotion dur="1.5s" repeatCount="indefinite">
          <mpath href="#dataPath" />
        </animateMotion>
      </circle>
      <path id="dataPath" d="M 80 80 L 120 80" fill="none" />
      <g transform="translate(100, 130)">
        <circle r="6" fill="none" stroke="currentColor" strokeWidth="2">
          <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export function SecurityVisual() {
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full">
      <path d="M 100 20 L 150 40 L 150 90 Q 150 130 100 145 Q 50 130 50 90 L 50 40 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M 100 35 L 135 50 L 135 85 Q 135 115 100 128 Q 65 115 65 85 L 65 50 Z" fill="currentColor" opacity="0.1">
        <animate attributeName="opacity" values="0.1;0.2;0.1" dur="2s" repeatCount="indefinite" />
      </path>
      <rect x="85" y="70" width="30" height="25" rx="3" fill="currentColor" />
      <path d="M 90 70 L 90 60 Q 90 50 100 50 Q 110 50 110 60 L 110 70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="80" r="4" fill="white" />
      <rect x="98" y="82" width="4" height="8" fill="white" />
      <line x1="60" y1="60" x2="140" y2="60" stroke="currentColor" strokeWidth="1" opacity="0">
        <animate attributeName="y1" values="40;120;40" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="40;120;40" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.5;0" dur="3s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}
