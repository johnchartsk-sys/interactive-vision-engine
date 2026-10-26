import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, LayoutDashboard, Mic, MicOff, Radio, Send, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askNia, type NiaMedia } from "@/lib/nia.functions";
import { NiaCommunicationCard } from "@/components/NiaCommunicationCard";
import type { CommunicationDraft } from "@/lib/nia-comms";

type Msg = { role: "user" | "assistant"; text: string; sources?: string[] | undefined; media?: NiaMedia[] | undefined };

function MediaView({ item }: { item: NiaMedia }) {
  if (item.type === "image")
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        <img src={item.thumbnail ?? item.url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8 }} />
        <small>{item.title}</small>
      </a>
    );
  if (item.type === "video")
    return (
      <div style={{ marginTop: 8 }}>
        <iframe
          title={item.title}
          src={`https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 8 }}
        />
        <small>{item.title}</small>
      </div>
    );
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, textDecoration: "underline" }}>
      Open: {item.title}
    </a>
  );
}

export function NiaChat({ dashboard, onClose, onRecommendation }: { dashboard: string; onClose: () => void; onRecommendation: (t: string) => void }) {
  const ask = useServerFn(askNia);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: "NIA online. All sectors connected. How can I assist, Commander?" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [draft, setDraft] = useState<CommunicationDraft | null>(null);
  const [testMode, setTestMode] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => () => { window.speechSynthesis?.cancel(); recRef.current?.stop?.(); }, []);
  useEffect(() => {
    try { setTestMode(window.localStorage.getItem("nia-communication-test-mode") !== "false"); } catch { /* Default to simulation if storage is unavailable. */ }
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [draft]);

  const speak = (t: string) => {
    if (!voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const vs = window.speechSynthesis.getVoices(); const pick = ["Ryan", "George", "Google UK English Male", "Daniel", "Arthur"].map((n) => vs.find((v) => v.name.includes(n))).find(Boolean) ?? vs.find((v) => v.lang === "en-GB"); if (pick) u.voice = pick; u.rate = 0.96; u.pitch = 0.8;
    window.speechSynthesis.speak(u);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy || draft) return;
    const next = [...messages, { role: "user" as const, text: t }];
    setMessages(next); setInput(""); setBusy(true); setError("");
    try {
      const r = await ask({ data: { messages: next.slice(-20).map(({ role, text }) => ({ role, text })), dashboard } });
      if (r.error) setError(r.error);
      else {
        setMessages((m) => [...m, { role: "assistant", text: r.reply, sources: r.sources, media: r.media }]);
        if (r.draft) setDraft(r.draft);
        speak(r.reply);
        if (/recommend/i.test(t)) onRecommendation(r.reply);
      }
    } catch { setError("NIA could not be reached. Please try again."); }
    finally { setBusy(false); }
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Voice input isn't supported in this browser. Try Chrome or Edge."); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false;
    rec.onresult = (e: any) => send(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="nia-chat-title" className="detail-dialog nia-chat" onClick={(e) => e.stopPropagation()}>
        <div className="detail-eyebrow">NAMTWIN-GO / NATIONAL INTELLIGENCE ASSISTANT</div>
        <div className="dialog-top">
          <h2 id="nia-chat-title"><Radio className="inline mr-2" size={18} />NIA</h2>
          <div className="flex gap-1">
            <Button variant="console" aria-label={voice ? "Mute NIA voice" : "Unmute NIA voice"} onClick={() => { setVoice((v) => !v); window.speechSynthesis?.cancel(); }}>{voice ? <Volume2 /> : <VolumeX />}</Button>
            <Button variant="console" aria-label="Close NIA" onClick={onClose}><X /></Button>
          </div>
        </div>
        <div className="nia-mode"><label><input type="checkbox" aria-label="Test mode" checked={testMode} disabled={busy || !!draft} onChange={e => {
          setTestMode(e.target.checked);
          try { window.localStorage.setItem("nia-communication-test-mode", String(e.target.checked)); } catch { /* Keep the in-memory choice. */ }
        }} />Test mode</label><span className="text-muted-foreground">{testMode ? "Simulated calls & emails" : "Real sending · confirmation required"}</span></div>
        <div className="nia-transcript" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`nia-msg ${m.role}`}>
              <p>{m.text}</p>
              {m.sources && m.sources.length > 0 && <small>Searched · {m.sources.join(" · ")}</small>}
              {m.media?.map((item, k) => <MediaView key={k} item={item} />)}
            </div>
          ))}
          {draft && <NiaCommunicationCard key={JSON.stringify(draft) + testMode} draft={draft} testMode={testMode} onCancel={attempted => {
            setDraft(null);
            setMessages(m => [...m, { role: "assistant", text: attempted ? "Request closed. Sending remains unconfirmed; check the provider before retrying." : "Draft cancelled. Nothing was sent." }]);
          }} onResult={text => {
            setDraft(null);
            setMessages(m => [...m, { role: "assistant", text }]);
            speak(text);
          }} />}
          {busy && <div className="nia-msg assistant"><p className="nia-thinking">NIA is analysing…</p></div>}
          <div ref={endRef} />
        </div>
        {error && <div role="alert" className="nia-error">{error}</div>}
        <div className="nia-quick">
          <Button variant="console" disabled={busy || !!draft} onClick={() => send("Explain the current dashboard status across all sectors.")}><LayoutDashboard />Explain dashboard</Button>
          <Button variant="console" disabled={busy || !!draft} onClick={() => send("Recommend the top 3 actions based on the current alerts and simulation.")}><Lightbulb />Recommend actions</Button>
        </div>
        <form className="nia-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea aria-label="Message NIA" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={listening ? "Listening…" : "Ask NIA anything…"} rows={2} />
          <Button type="button" variant="console" data-active={listening} aria-label={listening ? "Stop listening" : "Speak to NIA"} onClick={toggleMic}>{listening ? <MicOff /> : <Mic />}</Button>
          <Button type="submit" variant="action" disabled={busy || !!draft || !input.trim()} aria-label="Send"><Send /></Button>
        </form>
      </section>
    </div>
  );
}