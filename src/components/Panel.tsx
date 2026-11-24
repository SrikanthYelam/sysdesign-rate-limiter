import type { ReactNode } from 'react';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <aside className={`space-y-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4 ${className}`}>{children}</aside>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{children}</h2>
  );
}
