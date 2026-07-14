/**
 * components/review/score-ring.tsx — Circular score / progress rings.
 *
 * Two variants used across the investigation + results screens:
 *
 *  - <ScoreRing />    Large verdict centerpiece ("86 /100") with a thin
 *                     indigo arc, per the reference results layout.
 *  - <ProgressRing /> Small percentage ring ("42%") used in the
 *                     investigation header.
 *
 * Pure SVG — no runtime deps, honors prefers-reduced-motion by using a
 * simple CSS transition on the arc.
 */

import * as React from 'react';

const circumference = (radius: number): number => 2 * Math.PI * radius;

export interface ScoreRingProps {
  /** Score from 0–100. */
  score: number;
  /** Ring diameter in px. Defaults to 168. */
  size?: number;
  /** Arc color class, e.g. "text-primary" | "text-success". */
  toneClass?: string;
  /** Accessible label override. */
  label?: string;
}

/** Large "86 /100" verdict ring. */
const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 168,
  toneClass = 'text-primary',
  label,
}) => {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const c = circumference(radius);
  const clamped = Math.max(0, Math.min(100, score));
  const offset = c * (1 - clamped / 100);

  return (
    <div
      aria-label={label ?? `Overall score ${clamped} out of 100`}
      className="relative inline-flex items-center justify-center"
      role="img"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
        <circle
          className="text-border/80"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
        />
        <circle
          className={`${toneClass} transition-[stroke-dashoffset] duration-700 ease-out`}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-baseline gap-1">
          <span className="font-display text-5xl font-bold leading-none tracking-tight text-text-primary">
            {clamped}
          </span>
          <span className="text-caption font-medium text-text-muted">/100</span>
        </span>
      </div>
    </div>
  );
};

export interface ProgressRingProps {
  /** Percentage 0–100. */
  percent: number;
  /** Ring diameter in px. Defaults to 64. */
  size?: number;
}

/** Small "42%" progress ring for the investigation header. */
const ProgressRing: React.FC<ProgressRingProps> = ({ percent, size = 64 }) => {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const c = circumference(radius);
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = c * (1 - clamped / 100);

  return (
    <div
      aria-label={`Investigation ${clamped}% complete`}
      className="relative inline-flex shrink-0 items-center justify-center"
      role="img"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
        <circle
          className="text-border/80"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
        />
        <circle
          className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={stroke}
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-display text-caption font-semibold text-text-primary"
      >
        {clamped}%
      </span>
    </div>
  );
};

export { ScoreRing, ProgressRing };
