import { motion } from 'framer-motion';
import type { LimiterSnapshot } from '../../algorithms';

type State = Extract<LimiterSnapshot, { kind: 'leaky-bucket' }>;

/**
 * FIFO queue drawn as a horizontal pipe. New requests join on the left; the
 * head of the queue (right end) drips out toward the upstream service.
 */
export function LeakyBucketViz({ state }: { state: State }) {
  const { queue, capacity, leakRate, leakProgress } = state;
  const full = queue.length >= capacity;

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline justify-between font-mono text-[11px] text-slate-400">
        <span>
          queue <span className={`text-base ${full ? 'text-rose-400' : 'text-sky-300'}`}>{queue.length}</span>
          <span className="text-slate-500"> / {capacity}</span>
        </span>
        <span className="text-slate-500">leaks {leakRate}/s →</span>
      </div>

      <div className="relative">
        {/* Empty slots */}
        <div className="flex gap-1 rounded-md border border-slate-700 bg-slate-950/60 p-1.5">
          {Array.from({ length: capacity }, (_, i) => (
            <div key={i} className="h-7 flex-1 rounded-sm border border-dashed border-slate-800" />
          ))}
        </div>
        {/* Queued requests, head at the right. No exit animation on purpose:
            the released request continues as a particle toward Upstream, and
            AnimatePresence inside a per-frame re-render left exited nodes mounted. */}
        <div className="absolute inset-0 flex flex-row-reverse gap-1 border border-transparent p-1.5">
          {queue.map((id) => (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              className="h-7 shrink-0 rounded-sm bg-sky-400/80 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
              style={{ width: `calc((100% - ${(capacity - 1) * 4}px) / ${capacity})` }}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between font-mono text-[10px] text-slate-500">
          <span>next drip</span>
          <span>{Math.round(1000 / leakRate)}ms interval</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${leakProgress * 100}%` }} />
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-500">
        Bursts are buffered and released at a constant rate. Full queue → 429.
      </p>
    </div>
  );
}
