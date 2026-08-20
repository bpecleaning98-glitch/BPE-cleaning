import { useState, type ReactNode } from 'react';

/**
 * Charts, hand-drawn in SVG. No charting library: the whole cabinet needs
 * three shapes, and a library would cost more bytes than the rest of the
 * page put together.
 *
 * Rules followed here, deliberately:
 *  - one measure per chart, one hue per chart. Visits and requests are two
 *    charts sharing an x axis, never two lines on two scales.
 *  - grid and axes recede, the data does not.
 *  - hover is part of the chart, not an extra: a crosshair with a readout on
 *    the time series, a tooltip on every bar.
 *  - every chart has a written fallback when there is nothing to draw yet.
 */

const GOLD = 'var(--color-gold-deep)';
const INK = 'var(--color-ink)';

export type Point = { label: string; value: number; sub?: string };

/**
 * The daily line. Area under a 2px line, dots only where the pointer is, a
 * readout that follows it. Values are drawn on a 0..max scale with a soft
 * ceiling so a flat week does not look like a heartbeat.
 */
export function TimeSeries({
  points,
  height = 190,
  color = GOLD,
  unit = '',
}: {
  points: Point[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <NoData />;

  const W = 1000;
  const H = height;
  const padTop = 16;
  const padBottom = 26;
  const max = Math.max(4, ...points.map((p) => p.value));
  const plot = H - padTop - padBottom;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => padTop + plot - (v / max) * plot;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${padTop + plot} L0,${padTop + plot} Z`;
  const active = hover === null ? null : points[hover];

  return (
    <figure className="relative m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
        }}
      >
        {/* Three recessive grid lines are enough to read a level from. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={padTop + plot * t}
            y2={padTop + plot * t}
            stroke="currentColor"
            strokeWidth={1}
            className="text-ink/10"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={color} opacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padTop}
              y2={padTop + plot}
              stroke="currentColor"
              strokeWidth={1}
              className="text-ink/25"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={5} fill={color} />
          </>
        )}
      </svg>

      {/* Scale and dates live outside the stretched SVG, so the type stays
          the right shape however wide the panel gets. */}
      <span className="pointer-events-none absolute right-0 top-0 font-sans text-[0.62rem] tabular-nums text-stone">
        {max}
        {unit}
      </span>
      <figcaption className="mt-1 flex justify-between font-sans text-[0.62rem] text-stone">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </figcaption>

      {active && (
        <div className="pointer-events-none absolute left-0 top-0 border border-ink/15 bg-porcelain px-3 py-1.5 font-sans text-[0.68rem] text-ink">
          <strong className="font-semibold tabular-nums">{active.value}</strong>{' '}
          {unit || 'on'} {active.label}
        </div>
      )}
    </figure>
  );
}

/**
 * The small strip under the line: one bar per day for a second measure that
 * lives on its own scale. Same x axis, own chart, no second y axis anywhere.
 */
export function BarStrip({
  points,
  height = 64,
  color = INK,
  unit = '',
}: {
  points: Point[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <figure className="relative m-0" onMouseLeave={() => setHover(null)}>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {points.map((p, i) => (
          <span
            key={p.label + i}
            onMouseEnter={() => setHover(i)}
            className="relative flex-1 cursor-default"
            style={{ height: '100%' }}
          >
            <span
              className="absolute bottom-0 w-full transition-opacity"
              style={{
                height: `${Math.max(p.value ? 3 : 0, (p.value / max) * 100)}%`,
                background: color,
                opacity: hover === null || hover === i ? 0.85 : 0.35,
              }}
            />
          </span>
        ))}
      </div>
      {hover !== null && points[hover] && (
        <div className="pointer-events-none absolute right-0 top-0 border border-ink/15 bg-porcelain px-3 py-1.5 font-sans text-[0.68rem] text-ink">
          <strong className="font-semibold tabular-nums">{points[hover].value}</strong>{' '}
          {unit} {points[hover].label}
        </div>
      )}
    </figure>
  );
}

/**
 * Ranked list with the bar behind the label rather than beside it. Reads as
 * a table, measures as a chart, and never needs a legend because every row
 * writes its own name.
 */
export function RankBars({
  rows,
  color = GOLD,
  renderRight,
  emptyLabel = 'No data yet.',
}: {
  rows: { label: ReactNode; key: string; value: number; note?: ReactNode }[];
  color?: string;
  renderRight?: (row: { key: string; value: number }) => ReactNode;
  emptyLabel?: string;
}) {
  if (!rows.length) return <NoData label={emptyLabel} />;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="m-0 list-none p-0">
      {rows.map((row) => (
        <li key={row.key} className="relative border-b border-ink/8 last:border-b-0">
          <span
            className="absolute inset-y-0 left-0 block"
            style={{ width: `${(row.value / max) * 100}%`, background: color, opacity: 0.1 }}
            aria-hidden="true"
          />
          <span className="relative flex items-center justify-between gap-4 px-3 py-2.5">
            <span className="min-w-0 truncate font-sans text-[0.82rem] text-ink">
              {row.label}
              {row.note && <span className="ml-2 text-[0.7rem] text-stone">{row.note}</span>}
            </span>
            <span className="shrink-0 font-sans text-[0.82rem] font-medium tabular-nums text-ink">
              {renderRight ? renderRight(row) : row.value}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function NoData({ label = 'Nothing recorded in this period yet.' }: { label?: string }) {
  return (
    <p className="border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-stone">
      {label}
    </p>
  );
}
