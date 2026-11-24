import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { ALGORITHM_INFO, ALGORITHM_ORDER } from '../data/algorithmInfo';
import type { AlgorithmParams, Simulation } from '../hooks/useSimulation';
import { Panel, SectionTitle } from './Panel';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step = 1, unit, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-100">
          {value}
          {unit && <span className="ml-0.5 text-slate-500">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-xs text-slate-400"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-sky-500' : 'bg-slate-700'}`}>
        <motion.span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
          animate={{ left: checked ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </span>
    </button>
  );
}

export function ControlsPanel({ sim }: { sim: Simulation }) {
  const { algorithm, setAlgorithm, params, setParams } = sim;

  const update = <K extends keyof AlgorithmParams>(key: K, patch: Partial<AlgorithmParams[K]>) =>
    setParams((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  return (
    <Panel>
      <section>
        <SectionTitle>Execution Mode</SectionTitle>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1 text-xs">
          <div className="rounded-md bg-slate-800 px-2 py-2 text-center font-medium text-slate-100">
            Client-Side Engine
            <div className="mt-0.5 font-mono text-[10px] text-emerald-400">● active</div>
          </div>
          <button
            type="button"
            disabled
            title="Phase 2: see /backend-reference"
            className="cursor-not-allowed rounded-md px-2 py-2 text-center text-slate-500"
          >
            .NET + Redis Backend
            <div className="mt-0.5 font-mono text-[10px] text-amber-400/80">coming soon · phase 2</div>
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>Algorithm</SectionTitle>
        <div className="space-y-2" role="radiogroup">
          {ALGORITHM_ORDER.map((id) => {
            const selected = id === algorithm;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAlgorithm(id)}
                className={`relative w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selected ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                      selected ? 'border-sky-400' : 'border-slate-600'
                    }`}
                  >
                    {selected && <motion.span layoutId="algo-dot" className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                  </span>
                  <span className="text-sm font-medium text-slate-100">{ALGORITHM_INFO[id].name}</span>
                </div>
                <div className="mt-0.5 pl-[22px] text-xs text-slate-500">{ALGORITHM_INFO[id].tagline}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Traffic Generator</SectionTitle>
        <Slider label="Incoming traffic" value={sim.rps} min={0} max={50} unit="rps" onChange={sim.setRps} />
        <Toggle checked={sim.jitter} onChange={sim.setJitter} label="Random traffic jitter (Poisson)" />
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={sim.sendBurst}
          className="w-full rounded-lg border border-amber-400/40 bg-amber-400/10 py-2.5 text-sm font-semibold text-amber-300 shadow-[0_0_20px_-6px_rgba(251,191,36,0.5)] transition-colors hover:bg-amber-400/20"
        >
          ⚡ Send Burst (25 Requests)
        </motion.button>
      </section>

      <section className="space-y-4">
        <SectionTitle>Algorithm Parameters</SectionTitle>
        {algorithm === 'token-bucket' && (
          <>
            <Slider
              label="Bucket capacity"
              value={params.tokenBucket.capacity}
              min={1}
              max={30}
              unit="tokens"
              onChange={(v) => update('tokenBucket', { capacity: v })}
            />
            <Slider
              label="Refill rate"
              value={params.tokenBucket.refillRate}
              min={1}
              max={30}
              unit="tokens/s"
              onChange={(v) => update('tokenBucket', { refillRate: v })}
            />
          </>
        )}
        {algorithm === 'leaky-bucket' && (
          <>
            <Slider
              label="Queue capacity"
              value={params.leakyBucket.capacity}
              min={1}
              max={20}
              unit="slots"
              onChange={(v) => update('leakyBucket', { capacity: v })}
            />
            <Slider
              label="Leak rate"
              value={params.leakyBucket.leakRate}
              min={1}
              max={30}
              unit="req/s"
              onChange={(v) => update('leakyBucket', { leakRate: v })}
            />
          </>
        )}
        {(algorithm === 'fixed-window' || algorithm === 'sliding-window-log') && (
          <>
            <Slider
              label="Window size"
              value={params.window.windowSec}
              min={1}
              max={10}
              unit="s"
              onChange={(v) => update('window', { windowSec: v })}
            />
            <Slider
              label="Max requests per window"
              value={params.window.maxRequests}
              min={1}
              max={100}
              unit="req"
              onChange={(v) => update('window', { maxRequests: v })}
            />
          </>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">Changing a parameter resets the limiter state.</p>
      </section>
    </Panel>
  );
}
