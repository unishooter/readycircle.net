/**
 * Original geometric illustration built from circles, station points, and
 * relay paths -- deliberately not a stock photo of radio equipment, per
 * the brand direction (calm, local, technically credible).
 */
export function CircleIllustration() {
  return (
    <svg
      viewBox="0 0 480 420"
      role="img"
      aria-label="Diagram of overlapping neighborhood Radio Circles connected by relay paths between station points"
      className="h-auto w-full max-w-lg"
    >
      <g fill="none" stroke="currentColor" className="text-teal-200">
        <circle cx="180" cy="200" r="130" strokeWidth="2" />
        <circle cx="330" cy="150" r="90" strokeWidth="2" />
        <circle cx="310" cy="300" r="80" strokeWidth="2" />
      </g>
      <g stroke="currentColor" className="text-teal-400/70" strokeWidth="1.5" strokeDasharray="4 5">
        <line x1="180" y1="200" x2="330" y2="150" />
        <line x1="180" y1="200" x2="310" y2="300" />
        <line x1="330" y1="150" x2="310" y2="300" />
        <line x1="120" y1="140" x2="180" y2="200" />
        <line x1="150" y1="270" x2="180" y2="200" />
      </g>
      <g className="text-teal-700">
        <circle cx="180" cy="200" r="9" fill="currentColor" />
        <circle cx="120" cy="140" r="6" fill="currentColor" />
        <circle cx="150" cy="270" r="6" fill="currentColor" />
        <circle cx="230" cy="130" r="6" fill="currentColor" />
        <circle cx="330" cy="150" r="8" fill="currentColor" />
        <circle cx="370" cy="110" r="5" fill="currentColor" />
        <circle cx="310" cy="300" r="8" fill="currentColor" />
        <circle cx="350" cy="330" r="5" fill="currentColor" />
      </g>
      <g className="fill-ink/70 text-[11px] font-medium">
        <text x="180" y="200" dy="-16" textAnchor="middle">Home station</text>
        <text x="330" y="150" dy="-14" textAnchor="middle">Relay station</text>
        <text x="310" y="300" dy="24" textAnchor="middle">Church station</text>
      </g>
    </svg>
  );
}
