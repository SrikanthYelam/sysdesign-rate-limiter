import { useEffect, useRef, useState } from 'react';
import type { RpsSample } from '../hooks/useSimulation';

const H = 170;
const PAD = { l: 28, r: 8, t: 8, b: 20 };
const SAMPLE_SEC = 0.5;
const SERIES = [
  // Validated (dataviz palette check) against the slate-900 surface, dark mode.
  { key: 'incoming', label: 'Incoming', color: '#0b9ad8' },
  { key: 'allowed', label: 'Allowed', color: '#0aa877' },
] as const;

function niceMax(v: number): number {
  const steps = [10, 20, 30, 40, 50, 60, 80, 100];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 50) * 50;
}

/** Rolling 30s area chart: Incoming RPS vs Allowed RPS on one shared axis. */
export function RpsChart({ series }: { series: RpsSample[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  const n = series.length;
  const yMax = niceMax(Math.max(...series.map((s) => Math.max(s.incoming, s.allowed))));
  const innerW = Math.max(0, width - PAD.l - PAD.r);
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (n - 1)) * innerW;
  const y = (v: number) => PAD.t + innerH - (v / yMax) * innerH;

  const linePath = (key: 'incoming' | 'allowed') =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join('');
  const areaPath = (key: 'incoming' | 'allowed') =>
    `${linePath(key)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;

  const latest = series[n - 1];
  const hovered = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-slate-400">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="font-mono text-slate-100">{latest[s.key]}</span>
            <span className="text-slate-500">rps</span>
          </span>
        ))}
      </div>
      <div ref={ref} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Incoming ${latest.incoming} rps, allowed ${latest.allowed} rps over the last 30 seconds`}
            onPointerMove={(e) => {
              const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
              const i = Math.round(((mx - PAD.l) / innerW) * (n - 1));
              setHover(i >= 0 && i < n ? i : null);
            }}
            onPointerLeave={() => setHover(null)}
          >
            {[0, yMax / 2, yMax].map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} stroke="#1e293b" />
                <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500 font-mono text-[10px]">
                  {t}
                </text>
              </g>
            ))}
            {[
              [0, '-30s'],
              [Math.floor((n - 1) / 2), '-15s'],
              [n - 1, 'now'],
            ].map(([i, label]) => (
              <text
                key={label}
                x={x(i as number)}
                y={H - 4}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="fill-slate-500 font-mono text-[10px]"
              >
                {label}
              </text>
            ))}

            {SERIES.map((s) => (
              <path key={`a-${s.key}`} d={areaPath(s.key)} fill={s.color} fillOpacity={0.1} />
            ))}
            {SERIES.map((s) => (
              <path
                key={`l-${s.key}`}
                d={linePath(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {hover !== null && hovered && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} stroke="#64748b" strokeDasharray="2 3" />
                {SERIES.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(hovered[s.key])} r={4} fill={s.color} stroke="#0f172a" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {hover !== null && hovered && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-slate-700 bg-slate-900/95 px-2 py-1.5 font-mono text-[10px] shadow-lg"
            style={{ left: Math.min(x(hover) + 8, width - 110) }}
          >
            <div className="mb-0.5 text-slate-500">{((hover - (n - 1)) * SAMPLE_SEC).toFixed(1)}s</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label} <span className="ml-auto text-slate-100">{hovered[s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
