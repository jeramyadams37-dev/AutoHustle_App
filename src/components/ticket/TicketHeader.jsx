import { Wrench } from 'lucide-react';

export default function TicketHeader({ ticket, ticketData }) {
  const h = ticketData?.header || {};
  const date = new Date(ticket.created_date || Date.now()).toLocaleDateString();
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
      <div className="flex items-center gap-2 text-primary">
        <Wrench size={18} strokeWidth={2.5} />
        <span className="font-display font-bold uppercase tracking-widest text-sm">Auto-Hustle</span>
        <span className="text-muted-foreground font-display uppercase tracking-widest text-sm">· Diagnostic Shop Ticket</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="text-mono">{date}</span>
        {h.system_focus && <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">{h.system_focus}</span>}
      </div>
      <h1 className="mt-3 font-display font-bold text-2xl leading-tight">{h.vehicle_summary || ticket.vehicle_summary}</h1>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0 uppercase text-xs font-display tracking-wide mt-0.5">Symptoms</span><span>{h.symptoms || ticket.symptoms}</span></div>
        {(h.dtcs || ticket.dtcs) && (
          <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0 uppercase text-xs font-display tracking-wide mt-0.5">DTCs</span><span className="text-mono text-amber-300">{h.dtcs || ticket.dtcs}</span></div>
        )}
      </div>
    </div>
  );
}
