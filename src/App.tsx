import { ControlsPanel } from './components/ControlsPanel';
import { Pipeline } from './components/Pipeline';
import { TelemetryPanel } from './components/TelemetryPanel';
import { useSimulation } from './hooks/useSimulation';

export default function App() {
  const sim = useSimulation();

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-800/80 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 font-mono text-xs text-sky-300">
              RL
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">Distributed Rate Limiter &amp; Traffic Shaper</h1>
              <p className="font-mono text-[11px] text-slate-500">interactive simulator ·{' '}
                {sim.mode === 'remote' ? 'distributed .NET + Redis backend' : 'client-side engine'}</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> simulation running
          </span>
        </div>
      </header>

      <main className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[260px_minmax(0,1fr)_320px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <ControlsPanel sim={sim} />
        <div className="min-w-0">
          <Pipeline sim={sim} />
        </div>
        <TelemetryPanel sim={sim} />
      </main>
    </div>
  );
}
