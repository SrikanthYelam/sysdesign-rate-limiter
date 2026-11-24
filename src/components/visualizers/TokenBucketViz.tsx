import { motion } from 'framer-motion';
import type { LimiterSnapshot } from '../../algorithms';

type State = Extract<LimiterSnapshot, { kind: 'token-bucket' }>;

/** A bucket of glowing tokens; the next token fills up as a partial ring. */
export function TokenBucketViz({ state }: { state: State }) {
  const { tokens, capacity, refillRate } = state;
  const whole = Math.floor(tokens);
  const partial = tokens - whole;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex w-full items-baseline justify-between font-mono text-[11px] text-slate-400">
        <span>
          tokens <span className="text-base text-amber-300">{tokens.toFixed(1)}</span>
          <span className="text-slate-500"> / {capacity}</span>
        </span>
        <span className="text-slate-500">+{refillRate}/s refill</span>
      </div>

      {/* The bucket: open at the top, rounded at the bottom. */}
      <div className="relative w-full max-w-[340px] rounded-b-3xl border-x-2 border-b-2 border-slate-600/80 bg-slate-950/60 px-3 pb-3 pt-5">
        {/* wrap-reverse stacks rows upward, so tokens settle at the bottom. */}
        <div className="mx-auto flex max-w-[280px] flex-wrap-reverse justify-center gap-2">
          {Array.from({ length: capacity }, (_, slot) => {
            const full = slot < whole;
            const filling = slot === whole && partial > 0;
            return (
              <div key={slot} className="relative h-5 w-5">
                <div className="absolute inset-0 rounded-full border border-slate-800" />
                <motion.div
                  className="absolute inset-0 rounded-full bg-amber-300 shadow-[0_0_10px_2px_rgba(252,211,77,0.55)]"
                  initial={false}
                  animate={full ? { scale: 1, opacity: 1 } : { scale: 0.3, opacity: 0 }}
                  transition={full ? { type: 'spring', stiffness: 420, damping: 18 } : { duration: 0.18 }}
                />
                {filling && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(rgba(252,211,77,0.45) ${partial * 360}deg, transparent 0)`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-500">Each request spends one token. Empty bucket → 429.</p>
    </div>
  );
}
