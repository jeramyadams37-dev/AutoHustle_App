import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ChatPanel({ ticket }) {
  const [messages, setMessages] = useState(ticket.chat || []);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const send = async () => {
    const q = input.trim();
    if (!q || sending) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await base44.functions.invoke('askMechanic', {
        vehicle_summary: ticket.vehicle_summary,
        symptoms: ticket.symptoms,
        ticket_data: ticket.ticket_data,
        messages: next,
        question: q,
      });
      const reply = res.data?.reply || 'No response.';
      const updated = [...next, { role: 'assistant', content: reply }];
      setMessages(updated);
      await base44.entities.Ticket.update(ticket.id, { chat: updated });
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: 'Sorry, I hit an error: ' + (e.message || 'unknown') }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col" style={{ minHeight: 360, maxHeight: '60vh' }}>
      <div className="px-4 py-2.5 border-b border-border bg-zinc-900/60 flex items-center gap-2">
        <MessageSquare size={16} className="text-primary" />
        <span className="font-display font-semibold uppercase tracking-wide text-sm">Ask the Mechanic</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <Wrench size={28} className="mx-auto mb-2 text-primary/50" />
            Ask anything about this vehicle & symptom. The master mechanic has your full ticket as context.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-zinc-800 text-foreground rounded-bl-sm'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '120ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '240ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <div className="p-2.5 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask the master mechanic…"
          className="flex-1 bg-zinc-950 border border-border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button onClick={send} disabled={sending || !input.trim()} className="tap-target w-11 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
