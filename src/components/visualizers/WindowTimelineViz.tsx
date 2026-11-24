import { useLayoutEffect, useRef } from 'react';
import type { LimiterSnapshot } from '../../algorithms';
import type { DecisionEvent } from '../../hooks/useSimulation';

type State = Extract<LimiterSnapshot, { kind: 'fixed-window' | 'sliding-window-log' }>;

interface Props {
  state: State;
  now: number;
  log: readonly DecisionEvent[];
  width: number;
}

const HEIGHT = 120;
const NOW_AT = 0.8; // "now" sits at 80% of the width so the next boundary is visible
const COLORS = {
  allowed: '#34d399',
  rejected: '#fb7185',
  window: '#38bdf8',
  grid: '#334155',
  label: '#64748b',
  now: '#e2e8f0',
  surface: '#0b1220',
};

/** Cheap deterministic vertical jitter so dots at similar times don't stack. */
const jitter = (t: number) => ((Math.sin(t * 12.9898) * 43758.5453) % 1) * 9;

/**
 * Scrolling timeline: time flows right-to-left past a fixed "now" marker.
 * Drawn on a canvas because it can hold a thousand-plus points at 60fps.
 */
export function WindowTimelineViz({ state, now, log, width }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const span = state.windowMs * 2.5;
  const isFixed = state.kind === 'fixed-window';
  const count = isFixed ? state.count : state.log.length;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = HEIGHT * dpr;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    const t0 = now - NOW_AT * span;
    const x = (t: number) => ((t - t0) / span) * width;
    const rowAllowed = HEIGHT * 0.36;
    const rowRejected = HEIGHT * 0.72;

    // Active window region.
    const [winStart, winEnd] = isFixed ? [state.windowStart, state.windowStart + state.windowMs] : [now - state.windowMs, now];
    ctx.fillStyle = 'rgba(56,189,248,0.10)';
    ctx.fillRect(x(winStart), 4, x(winEnd) - x(winStart), HEIGHT - 8);
    ctx.strokeStyle = 'rgba(56,189,248,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x(winStart), 4, x(winEnd) - x(winStart), HEIGHT - 8);

    // Fixed window boundaries.
    if (isFixed) {
      ctx.strokeStyle = COLORS.grid;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      for (let b = Math.floor(t0 / state.windowMs) * state.windowMs; b <= t0 + span; b += state.windowMs) {
        ctx.beginPath();
        ctx.moveTo(x(b), 0);
        ctx.lineTo(x(b), HEIGHT);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Row labels.
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = COLORS.label;
    ctx.fillText('200', 6, rowAllowed - 10);
    ctx.fillText('429', 6, rowRejected - 10);

    // Request dots, with a surface-colored ring so overlaps stay legible.
    for (const e of log) {
      if (e.t < t0) continue;
      const px = x(e.t);
      const py = (e.allowed ? rowAllowed : rowRejected) + jitter(e.t);
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = e.allowed ? COLORS.allowed : COLORS.rejected;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = COLORS.surface;
      ctx.stroke();
    }

    // "Now" marker.
    const nx = x(now);
    ctx.strokeStyle = COLORS.now;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nx, 0);
    ctx.lineTo(nx, HEIGHT);
    ctx.stroke();
    ctx.fillStyle = COLORS.now;
    ctx.fillText('now', nx + 4, 14);
  });

  const msLeft = isFixed ? state.windowStart + state.windowMs - now : null;

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-baseline justify-between font-mono text-[11px] text-slate-400">
        <span>
          {isFixed ? 'window count' : 'log size'}{' '}
          <span className={`text-base ${count >= state.limit ? 'text-rose-400' : 'text-sky-300'}`}>{count}</span>
          <span className="text-slate-500"> / {state.limit}</span>
        </span>
        <span className="text-slate-500">
          {isFixed ? `resets in ${(Math.max(0, msLeft!) / 1000).toFixed(1)}s` : `window = last ${state.windowMs / 1000}s`}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="rounded-md border border-slate-800 bg-[#0b1220]"
        role="img"
        aria-label={`${count} of ${state.limit} requests used in the current window`}
      />
      <div className="h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${count >= state.limit ? 'bg-rose-400' : 'bg-sky-400'}`}
          style={{ width: `${Math.min(1, count / state.limit) * 100}%` }}
        />
      </div>
      <p className="text-center text-[11px] text-slate-500">
        {isFixed
          ? 'Counter resets at each dashed boundary: bursts straddling a boundary can pass 2× the limit.'
          : 'The window slides with time; old timestamps fall out on the left edge.'}
      </p>
    </div>
  );
}
