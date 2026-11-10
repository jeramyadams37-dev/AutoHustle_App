import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { exportTicketPDF } from '@/lib/pdfExport';
import TicketHeader from '@/components/ticket/TicketHeader';
import Flowchart from '@/components/diagrams/Flowchart';
import BeltDiagram from '@/components/diagrams/BeltDiagram';
import Module1 from '@/components/ticket/Module1';
import Module2 from '@/components/ticket/Module2';
import Module3 from '@/components/ticket/Module3';
import Module4 from '@/components/ticket/Module4';
import PartsList from '@/components/ticket/PartsList';
import PartsFinder from '@/components/ticket/PartsFinder';
import ChatPanel from '@/components/ticket/ChatPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

const TABS = [
  { value: 'diagnose', label: 'Diagnose' },
  { value: 'repair', label: 'Repair' },
  { value: 'location', label: 'Location' },
  { value: 'service', label: 'Service' },
  { value: 'parts', label: 'Parts' },
  { value: 'chat', label: 'Chat' },
];

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rerank, setRerank] = useState(null);
  const [reranking, setReranking] = useState(false);
  const [tab, setTab] = useState('diagnose');

  useEffect(() => {
    (async () => {
      try {
        const t = await base44.entities.Ticket.get(id);
        setTicket(t);
        setRerank(t.checklist_state?.rerank || null);
      } catch (e) {} finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="text-primary animate-spin" /></div>;
  if (!ticket) return <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"><p className="text-muted-foreground">Ticket not found.</p><button onClick={() => navigate('/garage')} className="mt-3 text-primary text-sm">Back to Garage</button></div>;

  const d = ticket.ticket_data || {};
  const progress = ticket.checklist_state?.items || {};
  const partsState = ticket.checklist_state?.parts || {};

  const persist = async (nextState) => {
    const updated = { ...ticket, checklist_state: nextState };
    setTicket(updated);
    try { await base44.entities.Ticket.update(ticket.id, { checklist_state: nextState }); } catch (e) {}
  };

  const onToggle = (itemId) => {
    const cur = progress[itemId] || {};
    const items = { ...progress, [itemId]: { ...cur, checked: !cur.checked } };
    persist({ ...ticket.checklist_state, items });
  };
  const onLog = (itemId, value) => {
    const cur = progress[itemId] || {};
    const items = { ...progress, [itemId]: { ...cur, value } };
    persist({ ...ticket.checklist_state, items });
  };
  const onTogglePart = (key) => {
    const cur = partsState[key] || {};
    const parts = { ...partsState, [key]: { ...cur, checked: !cur.checked } };
    persist({ ...ticket.checklist_state, parts });
  };

  const loggedReadings = Object.entries(progress).filter(([, v]) => v?.value).map(([id, v]) => ({ id, value: v.value }));
  const onRerank = async () => {
    setReranking(true);
    try {
      const res = await base44.functions.invoke('rerankCauses', {
        vehicle_summary: ticket.vehicle_summary,
        symptoms: ticket.symptoms,
        root_causes: d.module1?.root_causes,
        logged_readings: loggedReadings,
      });
      const r = res.data;
      setRerank(r);
      const nextState = { ...ticket.checklist_state, rerank: r };
      setTicket({ ...ticket, checklist_state: nextState });
      await base44.entities.Ticket.update(ticket.id, { checklist_state: nextState });
    } catch (e) {
      toast({ title: 'Re-rank failed', description: e.message, variant: 'destructive' });
    } finally { setReranking(false); }
  };

  // current flowchart node = first unchecked diagnostic test referenced in a node, else start
  const firstUncheckedTest = (d.module1?.diagnostic_tests || []).find((t) => !progress[t.id]?.checked);
  const currentNode = (() => {
    if (!d.flowchart?.nodes?.length) return null;
    if (firstUncheckedTest) {
      const node = d.flowchart.nodes.find((n) => (n.question || n.label || '').includes(firstUncheckedTest.id));
      if (node) return node.id;
    }
    return d.flowchart.nodes[0].id;
  })();

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `Auto-Hustle Ticket — ${ticket.vehicle_summary}`, url }); } catch {}
    } else {
      navigator.clipboard?.writeText(url);
      toast({ title: 'Link copied', description: 'Ticket link copied to clipboard.' });
    }
  };

  return (
    <div className="min-h-screen px-4 pt-3 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="tap-target inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex gap-2">
          <button onClick={() => exportTicketPDF(ticket)} className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm hover:border-primary/40">
            <Download size={16} /> PDF
          </button>
          <button onClick={handleShare} className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm hover:border-primary/40">
            <Share2 size={16} /> Share
          </button>
        </div>
      </div>

      <TicketHeader ticket={ticket} ticketData={d} />

      <div className="mt-4">
        <Flowchart flowchart={d.flowchart} currentId={currentNode} />
      </div>

      {d.belt_routing?.needed && (
        <div className="mt-4">
          <BeltDiagram routing={d.belt_routing} />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="w-full grid grid-cols-6 h-auto p-1 gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-[11px] px-1 py-2 font-display uppercase tracking-wide">{t.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="diagnose" className="mt-4">
          <Module1 data={d} progress={progress} onToggle={onToggle} onLog={onLog} rerank={rerank} onRerank={onRerank} reranking={reranking} />
        </TabsContent>
        <TabsContent value="repair" className="mt-4">
          {d.safety_warnings?.length > 0 && (
            <div className="space-y-2 mb-5">
              <h3 className="font-display font-bold uppercase tracking-wide text-red-400 text-sm">Safety Warnings</h3>
              {d.safety_warnings.map((w) => (
                <div key={w.id} className="rounded-xl border border-red-500/40 bg-red-950/20 p-3">
                  <div className="font-display font-semibold uppercase text-red-400 text-sm">{w.title}</div>
                  <p className="text-sm text-red-200/80 mt-1">{w.text}</p>
                </div>
              ))}
            </div>
          )}
          <Module2 data={d} progress={progress} onToggle={onToggle} onLog={onLog} warnings={d.safety_warnings} />
        </TabsContent>
        <TabsContent value="location" className="mt-4">
          <Module3 data={d} illustrations={ticket.illustrations} />
        </TabsContent>
        <TabsContent value="service" className="mt-4">
          <Module4 data={d} />
        </TabsContent>
        <TabsContent value="parts" className="mt-4">
          <><PartsList parts={d.parts_list} partsState={partsState} onTogglePart={onTogglePart} /><PartsFinder vehicle={d.header?.vehicle_summary || ticket.vehicle_summary} repair={d.header?.title || d.header?.system_focus || ''} parts={d.parts_list || []} /></>
        </TabsContent>
        <TabsContent value="chat" className="mt-4">
          <ChatPanel ticket={ticket} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
