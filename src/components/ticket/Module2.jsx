import { Hammer, ShieldAlert, Layers } from 'lucide-react';
import ChecklistItem from './ChecklistItem';
import RepairStepDiagram from './RepairStepDiagram';
import SafetyVisual from '@/components/diagrams/SafetyVisual';

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className="text-primary" />
      <h3 className="font-display font-bold uppercase tracking-wide text-base">{children}</h3>
    </div>
  );
}

export default function Module2({ data, progress, onToggle, onLog, warnings = [] }) {
  const m = data?.module2 || {};
  const phases = m.phases || [];
  const warnById = Object.fromEntries((warnings || []).map((w) => [w.id, w]));

  return (
    <div className="space-y-6">
      <SectionTitle icon={Layers}>Granular Repair Procedure</SectionTitle>
      {phases.map((phase, pi) => (
        <div key={pi} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-border flex items-center gap-2">
            <span className="font-display font-bold text-primary text-sm">{pi + 1}</span>
            <span className="font-display font-semibold uppercase tracking-wide text-sm">{phase.name}</span>
          </div>
          <div className="p-3 space-y-3">
            {phase.steps.map((step) => {
              const w = step.safety_warning ? warnById[step.safety_warning] || { id: step.safety_warning, title: 'Safety Warning', text: step.safety_warning } : null;
              return (
                <div key={step.id} className="space-y-2">
                  <ChecklistItem
                    id={step.id}
                    title={step.instruction}
                    badge={[step.torque_spec, step.tool_size].filter(Boolean).join(' · ') || undefined}
                    checked={progress?.[step.id]?.checked}
                    value={progress?.[step.id]?.value}
                    onToggle={onToggle}
                    onLog={onLog}
                  />
                  {(step.torque_spec || step.tool_size || step.parts_needed?.length) && (
                    <div className="flex flex-wrap gap-1.5 pl-10">
                      {step.torque_spec && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 text-mono">🔩 {step.torque_spec}</span>}
                      {step.tool_size && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/30 text-mono">🔧 {step.tool_size}</span>}
                      {step.parts_needed?.map((p, i) => (
                        <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">{p}</span>
                      ))}
                    </div>
                  )}
                  {w && <SafetyVisual warning={w} />}
                  <RepairStepDiagram step={step} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
