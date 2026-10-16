import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, LayoutDashboard, Mic, MicOff, Radio, Send, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askNia } from "@/lib/nia.functions";

type Msg = { role: "user" | "assistant"; text: string; sources?: string[] | undefined };

export function NiaChat({ dashboard, onClose, onRecommendation }: { dashboard: string; onClose: () => void; onRecommendation: (t: string) => void }) {
  const ask = useServerFn(askNia);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", text: "NIA online. All sectors connected. How can I assist, Commander?" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => () => { window.speechSynthesis?.cancel(); recRef.current?.stop?.(); }, []);

  const speak = (t: string) => {
    if (!voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.rate = 1; u.pitch = 0.95;
    window.speechSynthesis.speak(u);
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...messages, { role: "user" as const, text: t }];
    setMessages(next); setInput(""); setBusy(true); setError("");
    try {
      const r = await ask({ data: { messages: next.slice(-20).map(({ role, text }) => ({ role, text })), dashboard } });
      if (r.error) setError(r.error);
      else {
        setMessages((m) => [...m, { role: "assistant", text: r.reply, sources: r.sources }]);
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
        <div className="nia-transcript" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`nia-msg ${m.role}`}>
              <p>{m.text}</p>
              {m.sources && m.sources.length > 0 && <small>Searched · {m.sources.join(" · ")}</small>}
            </div>
          ))}
          {busy && <div className="nia-msg assistant"><p className="nia-thinking">NIA is analysing…</p></div>}
          <div ref={endRef} />
        </div>
        {error && <div role="alert" className="nia-error">{error}</div>}
        <div className="nia-quick">
          <Button variant="console" disabled={busy} onClick={() => send("Explain the current dashboard status across all sectors.")}><LayoutDashboard />Explain dashboard</Button>
          <Button variant="console" disabled={busy} onClick={() => send("Recommend the top 3 actions based on the current alerts and simulation.")}><Lightbulb />Recommend actions</Button>
        </div>
        <form className="nia-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea aria-label="Message NIA" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={listening ? "Listening…" : "Ask NIA anything…"} rows={2} />
          <Button type="button" variant="console" data-active={listening} aria-label={listening ? "Stop listening" : "Speak to NIA"} onClick={toggleMic}>{listening ? <MicOff /> : <Mic />}</Button>
          <Button type="submit" variant="action" disabled={busy || !input.trim()} aria-label="Send"><Send /></Button>
        </form>
      </section>
    </div>
  );
}
