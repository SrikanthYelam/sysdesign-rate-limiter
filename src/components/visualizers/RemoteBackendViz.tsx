import type { RemoteStats } from '../../hooks/useSimulation';

/**
 * Backend mode: the bucket lives in Redis, so instead of drawing it we show
 * what the gateway reports back: tokens left after the last allowed request,
 * and how requests were spread across the gateway replicas.
 */
export function RemoteBackendViz({ stats, capacity }: { stats: RemoteStats; capacity: number }) {
  const instances = [...stats.byInstance.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = instances.reduce((sum, [, n]) => sum + n, 0);
  const remaining = stats.lastRemaining;

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div>
        <div className="flex items-baseline justify-between font-mono text-[11px] text-slate-400">
          <span>
            tokens left{' '}
            <span className="text-base text-amber-300">{remaining ?? '–'}</span>
            <span className="text-slate-500"> / {capacity}</span>
          </span>
          <span className="text-slate-500">after last 200</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-amber-300"
            style={{ width: `${((remaining ?? 0) / capacity) * 100}%` }}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 font-mono text-[11px] text-slate-400">answered by gateway replica (X-Instance)</div>
        {instances.length === 0 ? (
          <div className="font-mono text-[11px] text-slate-500">waiting for responses…</div>
        ) : (
          <div className="space-y-1.5">
            {instances.map(([id, count]) => (
              <div key={id} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-16 shrink-0 text-slate-300">{id}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-slate-400">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-500">
        Decided by the .NET gateway. The bucket itself lives in Redis, shared by every replica.
      </p>
    </div>
  );
}
