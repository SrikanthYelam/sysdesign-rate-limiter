import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlgorithmId, LimiterConfig } from '../algorithms';
import {
  ClientSimulationProvider,
  RemoteApiProvider,
  type IRateLimiterProvider,
  type ProviderSnapshot,
} from '../engine';

export type ExecutionMode = 'client' | 'remote';

/** What the UI can show about the remote backend, whose state lives in Redis. */
export interface RemoteStats {
  /** Tokens left after the most recent allowed request. */
  lastRemaining: number | null;
  /** Requests answered per gateway replica (X-Instance header). */
  byInstance: Map<string, number>;
}

const BACKEND_DOWN_MESSAGE = "Can't reach the backend on localhost:8080. Start it with: cd backend && docker compose up";

/** Time a request particle takes to travel from Clients to the Gateway. */
export const INBOUND_TRAVEL_MS = 700;
const BURST_SIZE = 25;
const BURST_STAGGER_MS = 12;
/** Hard cap on rendered particles; requests beyond it are still simulated. */
const MAX_PARTICLES = 220;
const FLUSH_MS = 16;
const SAMPLE_MS = 500;
const HISTORY_SAMPLES = 60; // 60 x 500ms = 30s
const DECISION_LOG_MS = 30_000;

export type ParticlePhase = 'inbound' | 'waiting' | 'allowed' | 'rejected';

export interface Particle {
  id: string;
  phase: ParticlePhase;
  /** Vertical offset in [-1, 1] so particles don't overlap on one line. */
  lane: number;
}

export interface DecisionEvent {
  /** Provider clock (ms). */
  t: number;
  allowed: boolean;
}

export interface RpsSample {
  incoming: number;
  allowed: number;
}

export interface Telemetry {
  allowed: number;
  throttled: number;
  series: RpsSample[];
}

export interface AlgorithmParams {
  tokenBucket: { capacity: number; refillRate: number };
  leakyBucket: { capacity: number; leakRate: number };
  window: { windowSec: number; maxRequests: number };
}

const DEFAULT_PARAMS: AlgorithmParams = {
  tokenBucket: { capacity: 10, refillRate: 5 },
  leakyBucket: { capacity: 10, leakRate: 5 },
  window: { windowSec: 3, maxRequests: 15 },
};

function toConfig(algorithm: AlgorithmId, p: AlgorithmParams): LimiterConfig {
  switch (algorithm) {
    case 'token-bucket':
      return { algorithm, ...p.tokenBucket };
    case 'leaky-bucket':
      return { algorithm, ...p.leakyBucket };
    case 'fixed-window':
    case 'sliding-window-log':
      return { algorithm, ...p.window };
  }
}

/** Count timestamps within the last second and drop older ones in place. */
function countLastSecond(times: number[], now: number): number {
  let i = 0;
  while (i < times.length && times[i] <= now - 1000) i++;
  times.splice(0, i);
  return times.length;
}

type ParticleOp =
  | { type: 'add'; particle: Particle }
  | { type: 'phase'; id: string; phase: ParticlePhase }
  | { type: 'remove'; id: string };

function applyParticleOps(particles: Particle[], ops: ParticleOp[]): Particle[] {
  const byId = new Map(particles.map((p) => [p.id, p]));
  for (const op of ops) {
    if (op.type === 'add') {
      if (byId.size < MAX_PARTICLES) byId.set(op.particle.id, op.particle);
    } else if (op.type === 'remove') {
      byId.delete(op.id);
    } else {
      const p = byId.get(op.id);
      if (p) byId.set(op.id, { ...p, phase: op.phase });
    }
  }
  return Array.from(byId.values());
}

const emptySeries =(): RpsSample[] => Array.from({ length: HISTORY_SAMPLES }, () => ({ incoming: 0, allowed: 0 }));

export function useSimulation() {
  const [mode, setModeState] = useState<ExecutionMode>('client');
  const [backendError, setBackendError] = useState<string | null>(null);
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('token-bucket');
  const [params, setParams] = useState<AlgorithmParams>(DEFAULT_PARAMS);
  const [rps, setRps] = useState(8);
  const [jitter, setJitter] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry>({ allowed: 0, throttled: 0, series: emptySeries() });

  const config = useMemo(() => toConfig(algorithm, params), [algorithm, params]);
  const configRef = useRef(config);
  configRef.current = config;

  const providerRef = useRef<IRateLimiterProvider | null>(null);
  const timers = useRef(new Set<number>());
  const seq = useRef(0);
  // High-frequency metrics live in refs and are sampled into React state.
  const counts = useRef({ allowed: 0, throttled: 0 });
  const incomingTimes = useRef<number[]>([]);
  const allowedTimes = useRef<number[]>([]);
  const decisionLog = useRef<DecisionEvent[]>([]);
  const particleOps = useRef<ParticleOp[]>([]);
  const flushScheduled = useRef(false);
  const remoteStats = useRef<RemoteStats>({ lastRemaining: null, byInstance: new Map() });

  /** setTimeout that is automatically cancelled on unmount. */
  const later = useCallback((fn: () => void, ms: number) => {
    const handle = window.setTimeout(() => {
      timers.current.delete(handle);
      fn();
    }, ms);
    timers.current.add(handle);
  }, []);

  /** The backend only implements Token Bucket so far. */
  const setMode = useCallback((next: ExecutionMode) => {
    if (next === 'remote') setAlgorithm('token-bucket');
    setModeState(next);
  }, []);

  // Cancel every pending timer on unmount.
  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      pendingTimers.forEach((h) => window.clearTimeout(h));
      pendingTimers.clear();
      flushScheduled.current = false;
    };
  }, []);

  // One provider per execution mode. Requests already on their way to the
  // gateway are evaluated by whichever provider is current when they arrive.
  useEffect(() => {
    // '' = same origin; the Vite dev server proxies /api to the backend (vite.config.ts).
    const provider =
      mode === 'remote' ? new RemoteApiProvider('') : new ClientSimulationProvider(configRef.current);
    providerRef.current = provider;
    remoteStats.current = { lastRemaining: null, byInstance: new Map() };
    setBackendError(null);
    return () => {
      provider.dispose();
      providerRef.current = null;
    };
  }, [mode]);

  // Declared after the provider effect so a new provider is configured right away.
  useEffect(() => {
    providerRef.current?.configure(config).catch(() => setBackendError(BACKEND_DOWN_MESSAGE));
    decisionLog.current = []; // limiter state was reset, so is its history
  }, [config, mode]);

  // Particle changes are queued and applied in one batch per ~frame, so 50 RPS
  // (three changes per request) costs ~60 renders/s instead of ~150.
  const queueParticleOp = useCallback(
    (op: ParticleOp) => {
      particleOps.current.push(op);
      if (flushScheduled.current) return;
      flushScheduled.current = true;
      later(() => {
        flushScheduled.current = false;
        const batch = particleOps.current;
        particleOps.current = [];
        setParticles((ps) => applyParticleOps(ps, batch));
      }, FLUSH_MS);
    },
    [later],
  );

  const setPhase = useCallback(
    (id: string, phase: ParticlePhase) => queueParticleOp({ type: 'phase', id, phase }),
    [queueParticleOp],
  );

  const removeParticle = useCallback((id: string) => queueParticleOp({ type: 'remove', id }), [queueParticleOp]);

  const sendRequest = useCallback(() => {
    const id = `req-${++seq.current}`;
    queueParticleOp({ type: 'add', particle: { id, phase: 'inbound', lane: Math.random() * 2 - 1 } });

    later(() => {
      const provider = providerRef.current;
      if (!provider) return;
      incomingTimes.current.push(performance.now());
      setPhase(id, 'waiting');

      provider.evaluateRequest(id).then(
        (decision) => {
          if (decision.allowed) {
            counts.current.allowed++;
            allowedTimes.current.push(performance.now());
          } else {
            counts.current.throttled++;
          }
          decisionLog.current.push({ t: decision.decidedAt, allowed: decision.allowed });
          if (decision.servedBy) {
            const stats = remoteStats.current;
            stats.byInstance.set(decision.servedBy, (stats.byInstance.get(decision.servedBy) ?? 0) + 1);
            if (decision.allowed && decision.remaining !== undefined) stats.lastRemaining = decision.remaining;
          }
          setBackendError(null);
          setPhase(id, decision.allowed ? 'allowed' : 'rejected');
        },
        // Backend unreachable: drop the particle instead of leaving it stuck at the gateway.
        () => {
          setBackendError(BACKEND_DOWN_MESSAGE);
          removeParticle(id);
        },
      );
    }, INBOUND_TRAVEL_MS);
  }, [later, queueParticleOp, setPhase, removeParticle]);

  const sendBurst = useCallback(() => {
    for (let i = 0; i < BURST_SIZE; i++) later(sendRequest, i * BURST_STAGGER_MS);
  }, [later, sendRequest]);

  // Continuous traffic generator. With jitter, inter-arrival times are
  // exponentially distributed (a Poisson process) with the same mean rate.
  useEffect(() => {
    if (rps <= 0) return;
    const meanMs = 1000 / rps;
    const gap = () => (jitter ? -Math.log(1 - Math.random()) * meanMs : meanMs);
    // Arrivals follow a schedule of due times, so a late timer catches up
    // instead of silently lowering the rate when the main thread is busy.
    let due = performance.now() + gap();
    let handle = 0;
    const tick = () => {
      const now = performance.now();
      due = Math.max(due, now - 1000); // after a long stall (hidden tab), replay at most 1s
      while (due <= now) {
        sendRequest();
        due += gap();
      }
      handle = window.setTimeout(tick, due - now);
    };
    handle = window.setTimeout(tick, due - performance.now());
    return () => window.clearTimeout(handle);
  }, [rps, jitter, sendRequest]);

  // Sample metrics into React state at a fixed cadence.
  useEffect(() => {
    const handle = window.setInterval(() => {
      const now = performance.now();
      const sample = {
        incoming: countLastSecond(incomingTimes.current, now),
        allowed: countLastSecond(allowedTimes.current, now),
      };
      // Prune relative to the newest entry: the remote provider has no snapshot clock.
      const log = decisionLog.current;
      const newest = log.length > 0 ? log[log.length - 1].t : 0;
      let stale = 0;
      while (stale < log.length && log[stale].t < newest - DECISION_LOG_MS) stale++;
      log.splice(0, stale);

      setTelemetry((prev) => ({
        allowed: counts.current.allowed,
        throttled: counts.current.throttled,
        series: [...prev.series.slice(1), sample],
      }));
    }, SAMPLE_MS);
    return () => window.clearInterval(handle);
  }, []);

  const getSnapshot = useCallback((): ProviderSnapshot | null => providerRef.current?.getSnapshot() ?? null, []);
  const getDecisionLog = useCallback((): readonly DecisionEvent[] => decisionLog.current, []);
  const getRemoteStats = useCallback((): RemoteStats => remoteStats.current, []);

  return {
    mode,
    setMode,
    backendError,
    algorithm,
    setAlgorithm,
    params,
    setParams,
    rps,
    setRps,
    jitter,
    setJitter,
    sendBurst,
    particles,
    removeParticle,
    telemetry,
    getSnapshot,
    getDecisionLog,
    getRemoteStats,
  };
}

export type Simulation = ReturnType<typeof useSimulation>;
