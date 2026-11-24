import { AnimatePresence, motion } from 'framer-motion';
import { ALGORITHM_INFO } from '../data/algorithmInfo';
import type { Simulation } from '../hooks/useSimulation';
import { Panel, SectionTitle } from './Panel';
import { RpsChart } from './RpsChart';

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function List({ title, items, marker }: { title: string; items: string[]; marker: string }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-slate-300">{title}</h3>
      <ul className="space-y-1 text-xs leading-relaxed text-slate-400">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={`shrink-0 font-mono ${marker}`}>{title === 'Pros' ? '+' : title === 'Cons' ? '−' : '›'}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TelemetryPanel({ sim }: { sim: Simulation }) {
  const { allowed, throttled, series } = sim.telemetry;
  const total = allowed + throttled;
  const dropRate = total === 0 ? 0 : (throttled / total) * 100;
  const info = ALGORITHM_INFO[sim.algorithm];

  return (
    <Panel>
      <section>
        <SectionTitle>Telemetry</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="200 OK" value={allowed.toLocaleString()} tone="text-emerald-400" />
          <Kpi label="429" value={throttled.toLocaleString()} tone="text-rose-400" />
          <Kpi label="Drop rate" value={`${dropRate.toFixed(1)}%`} tone="text-slate-100" />
        </div>
      </section>

      <section>
        <SectionTitle>Throughput · last 30s</SectionTitle>
        <RpsChart series={series} />
      </section>

      <section>
        <SectionTitle>Under the Hood</SectionTitle>
        <AnimatePresence mode="wait">
          <motion.div
            key={sim.algorithm}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{info.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{info.summary}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-slate-500">time</div>
                <div className="text-sky-300">{info.time}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                <div className="text-slate-500">space</div>
                <div className="text-sky-300">{info.space}</div>
              </div>
            </div>
            <List title="Pros" items={info.pros} marker="text-emerald-400" />
            <List title="Cons" items={info.cons} marker="text-rose-400" />
            <List title="Used in the wild" items={info.usage} marker="text-slate-500" />
          </motion.div>
        </AnimatePresence>
      </section>
    </Panel>
  );
}
