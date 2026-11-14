// Settings → API Keys. One-tap Gemini key setup (BYOK).
// The key is free from Google AI Studio, stays on this phone, and is
// tied to the signed-in account. It is sent with each backend request
// so the backend can call Gemini as you; the backend does not store it.
// Tap "Get your free Gemini key", tap "Create API key" in AI Studio,
// paste it below, save. Done.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ExternalLink, Trash2, LogOut, Check, ArrowLeft, ShieldCheck } from 'lucide-react';
import { saveGeminiKey, clearGeminiKey, maskedKey, hasGeminiKey, AI_STUDIO_URL } from '@/lib/apiKeys';
import { getCurrentAccount, signOut } from '@/lib/accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ApiKeys() {
  const navigate = useNavigate();
  const account = getCurrentAccount();
  const [keyInput, setKeyInput] = useState('');
  const [editing, setEditing] = useState(!hasGeminiKey());
  const [saved, setSaved] = useState(hasGeminiKey());
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    try {
      saveGeminiKey(keyInput);
      setSaved(true);
      setEditing(false);
      setKeyInput('');
    } catch (e) {
      setError(e.message || 'Could not save the key.');
    }
  };

  const handleRemove = () => {
    clearGeminiKey();
    setSaved(false);
    setEditing(true);
  };

  const handleSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen px-5 pt-4 pb-10">
      <button onClick={() => navigate(-1)} className="tap-target inline-flex items-center gap-1 text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft size={18} /> Back
      </button>
      <h1 className="font-display font-bold text-3xl">API Keys</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Your Gemini key pays for your own diagnoses — not Jeramy&apos;s. It is free, it stays on your phone, and it is only used for your own tickets.
      </p>

      {account ? (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</div>
            <div className="font-semibold">{account.email}</div>
          </div>
          <button onClick={handleSignOut} className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          You are not signed in. <Link to="/login" className="text-primary font-medium underline">Log in</Link> or <Link to="/register" className="text-primary font-medium underline">create an account</Link> first — the key is saved to your account.
        </div>
      )}

      {/* Gemini key */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 font-display font-semibold uppercase tracking-wide text-sm">
          <KeyRound size={16} className="text-primary" /> Gemini key
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Free from Google AI Studio. Tap the button, tap &quot;Create API key&quot;, then paste it below. The key never leaves your phone except to call Gemini for your own diagnoses.
        </p>
        <a
          href={AI_STUDIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap-target mt-3 inline-flex w-full h-12 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm"
        >
          <ExternalLink size={17} /> Get your free Gemini key
        </a>

        {saved && !editing ? (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-green-400" />
              <span>Key saved <span className="font-mono">{maskedKey()}</span></span>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>Change key</Button>
              <Button variant="outline" className="flex-1 text-red-400" onClick={handleRemove}><Trash2 size={15} className="mr-1" /> Remove</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Label htmlFor="gemini-key">Paste your Gemini key</Label>
            <Input
              id="gemini-key"
              type="password"
              autoComplete="off"
              autoFocus
              placeholder="AIza…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="h-12 font-mono"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button className="w-full h-12 font-medium" onClick={handleSave} disabled={!account || !keyInput.trim()}>
              Save key
            </Button>
            {!account && <p className="text-xs text-muted-foreground">Log in first — the key is saved to your account.</p>}
          </div>
        )}
      </div>

      {/* Garage backup */}
      <Link to="/garage" className="mt-4 rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <ShieldCheck size={18} className="text-primary shrink-0" />
        <span>
          <span className="font-display font-semibold uppercase tracking-wide text-xs">Back up your garage</span>
          <span className="block text-sm text-muted-foreground mt-0.5">Export your vehicles, tickets and documents to a file — or back them up to your own Google Drive automatically.</span>
        </span>
      </Link>

      {/* Stores note */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground leading-relaxed">
        <span className="font-display font-semibold uppercase tracking-wide text-foreground text-xs">Nearby stores</span>
        <p className="mt-1">Store lookups use OpenStreetMap — free, no key needed, no billing. Hours and phone numbers may be missing for some shops.</p>
      </div>
    </div>
  );
}
