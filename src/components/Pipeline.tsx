import { motion } from 'framer-motion';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALGORITHM_INFO } from '../data/algorithmInfo';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { INBOUND_TRAVEL_MS, type ParticlePhase, type Simulation } from '../hooks/useSimulation';
import { LeakyBucketViz } from './visualizers/LeakyBucketViz';
import { TokenBucketViz } from './visualizers/TokenBucketViz';
import { WindowTimelineViz } from './visualizers/WindowTimelineViz';

const HEIGHT = 500;
const NODE_W = 88;
const PARTICLE = 10;
const LANE_SPREAD = 22;

/** Pixel coordinates of every node, derived from the container width. */
function useGeometry(width: number) {
  return useMemo(() => {
    const midY = HEIGHT * 0.4;
    const clientsX = Math.max(NODE_W / 2 + 4, width * 0.075);
    const upstreamX = width - clientsX;
    const gatewayLeft = clientsX + NODE_W / 2 + Math.max(40, width * 0.07);
    const gatewayRight = width - gatewayLeft;
    return {
      midY,
      clientsX,
      upstreamX,
      gatewayLeft,
      gatewayRight,
      gatewayTop: HEIGHT * 0.07,
      gatewayBottom: HEIGHT * 0.73,
      dropX: (clientsX + gatewayLeft) / 2,
      dropY: HEIGHT * 0.9,
    };
  }, [width]);
}
type Geometry = ReturnType<typeof useGeometry>;

interface ParticleProps {
  id: string;
  phase: ParticlePhase;
  lane: number;
  g: Geometry;
  onDone: (id: string) => void;
}

/**
 * One HTTP request. Its phase picks the animation; when a terminal animation
 * (allowed / rejected) finishes, it calls onDone so the parent removes it from
 * state. This is what keeps the particle list bounded.
 */
const RequestParticle = memo(function RequestParticle({ id, phase, lane, g, onDone }: ParticleProps) {
  const y = g.midY + lane * LANE_SPREAD - PARTICLE / 2;
  const off = PARTICLE / 2;

  const variants = {
    inbound: {
      x: [g.clientsX + NODE_W / 2 - off, g.gatewayLeft - off],
      y: [y, y],
      opacity: [0, 1],
      transition: { duration: INBOUND_TRAVEL_MS / 1000, ease: 'linear' },
    },
    waiting: { opacity: 0, transition: { duration: 0.1 } },
    allowed: {
      x: [g.gatewayRight - off, g.upstreamX - NODE_W / 2 - off],
      y: [y, g.midY - off],
      opacity: [1, 1, 0],
      scale: 1,
      transition: { duration: 0.65, ease: 'easeOut' },
    },
    rejected: {
      // Bounce off the gateway wall, shake, then fall into the drop bin.
      x: [g.gatewayLeft - off, g.gatewayLeft - off - 6, g.gatewayLeft - off + 4, g.gatewayLeft - off - 4, g.dropX - off],
      y: [y, y, y, y, g.dropY - off],
      opacity: [1, 1, 1, 1, 0],
      scale: [1.3, 1.3, 1.3, 1.2, 0.6],
      transition: { duration: 0.9, times: [0, 0.08, 0.16, 0.24, 1], ease: 'easeIn' },
    },
  };

  const color =
    phase === 'allowed'
      ? 'bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]'
      : phase === 'rejected'
        ? 'bg-rose-500 shadow-[0_0_10px_2px_rgba(244,63,94,0.6)]'
        : 'bg-sky-400 shadow-[0_0_8px_1px_rgba(56,189,248,0.5)]';

  return (
    <motion.div
      className={`pointer-events-none absolute left-0 top-0 rounded-full ${color}`}
      style={{ width: PARTICLE, height: PARTICLE }}
      initial={{ opacity: 0 }}
      animate={phase}
      variants={variants}
      onAnimationComplete={() => {
        if (phase === 'allowed' || phase === 'rejected') onDone(id);
      }}
    />
  );
});

function Node({ x, y, label, sub, accent }: { x: number; y: number; label: string; sub: ReactNode; accent: string }) {
  return (
    <div
      className="absolute flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 py-3 text-center"
      style={{ left: x - NODE_W / 2, top: y - 40, width: NODE_W, height: 80 }}
    >
      <span className={`mb-1 h-2 w-2 rounded-full ${accent}`} />
      <span className="text-xs font-semibold text-slate-100">{label}</span>
      <span className="font-mono text-[10px] text-slate-500">{sub}</span>
    </div>
  );
}

/** The rate limiter box. Re-renders every frame to show live internal state. */
function Gateway({ sim, g }: { sim: Simulation; g: Geometry }) {
  useAnimationFrame();
  const snap = sim.getSnapshot();
  const innerWidth = g.gatewayRight - g.gatewayLeft - 34;

  let body = null;
  if (snap) {
    const s = snap.state;
    if (s.kind === 'token-bucket') body = <TokenBucketViz state={s} />;
    else if (s.kind === 'leaky-bucket') body = <LeakyBucketViz state={s} />;
    else body = <WindowTimelineViz state={s} now={snap.now} log={sim.getDecisionLog()} width={innerWidth} />;
  }

  return (
    <div
      className="absolute flex flex-col rounded-2xl border border-sky-500/30 bg-slate-900/80 shadow-[0_0_40px_-12px_rgba(56,189,248,0.35)]"
      style={{ left: g.gatewayLeft, top: g.gatewayTop, width: g.gatewayRight - g.gatewayLeft, height: g.gatewayBottom - g.gatewayTop }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <span className="truncate text-xs font-semibold text-slate-100">API Gateway · Rate Limiter</span>
        <span className="shrink-0 whitespace-nowrap rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
          {ALGORITHM_INFO[sim.algorithm].name}
        </span>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">{body}</div>
    </div>
  );
}

export function Pipeline({ sim }: { sim: Simulation }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const g = useGeometry(width);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Live Pipeline</h2>
        <div className="flex gap-3 font-mono text-[10px] text-slate-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />in flight</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />200 OK</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />429</span>
        </div>
      </div>
      <div
        ref={ref}
        className="relative overflow-hidden rounded-lg bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.08)_1px,transparent_0)] [background-size:20px_20px]"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <>
            <svg className="absolute inset-0" width={width} height={HEIGHT} aria-hidden>
              <g strokeDasharray="4 6" strokeWidth={1.5} fill="none">
                <line x1={g.clientsX + NODE_W / 2} y1={g.midY} x2={g.gatewayLeft} y2={g.midY} stroke="#334155" />
                <line x1={g.gatewayRight} y1={g.midY} x2={g.upstreamX - NODE_W / 2} y2={g.midY} stroke="rgba(52,211,153,0.35)" />
                <line x1={g.gatewayLeft - 4} y1={g.midY + 12} x2={g.dropX} y2={g.dropY - 26} stroke="rgba(244,63,94,0.35)" />
              </g>
            </svg>

            <Node
              x={g.clientsX}
              y={g.midY}
              label="Clients"
              sub={
                <>
                  target {sim.rps} rps
                  <br />
                  actual <span className="text-sky-300">{sim.telemetry.series[sim.telemetry.series.length - 1].incoming}</span> rps
                </>
              }
              accent="bg-sky-400"
            />
            <Node
              x={g.upstreamX}
              y={g.midY}
              label="Upstream"
              sub={`${sim.telemetry.allowed} ok`}
              accent="bg-emerald-400"
            />
            <Gateway sim={sim} g={g} />

            {/* Drop bin for 429s */}
            <div
              className="absolute flex flex-col items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10"
              style={{ left: g.dropX - 44, top: g.dropY - 24, width: 88, height: 48 }}
            >
              <span className="font-mono text-sm font-semibold text-rose-300">{sim.telemetry.throttled}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-rose-400/70">dropped</span>
            </div>

            {sim.particles.map((p) => (
              <RequestParticle key={p.id} id={p.id} phase={p.phase} lane={p.lane} g={g} onDone={sim.removeParticle} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
