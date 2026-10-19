import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendCommunication } from "@/lib/nia-comms.functions";
import type { CommunicationDraft } from "@/lib/nia-comms";

export function NiaCommunicationCard({ draft, testMode, onCancel, onResult }: {
  draft: CommunicationDraft;
  testMode: boolean;
  onCancel: (attempted: boolean) => void;
  onResult: (message: string) => void;
}) {
  const transmit = useServerFn(sendCommunication);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);

  const confirm = async () => {
    if (inFlight.current || attempted || (!testMode && !token.trim())) return;
    inFlight.current = true;
    setBusy(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await transmit({ data: { draft, testMode, confirmed: true, token, requestId: requestId.current } });
      setAttempted(true);
      onResult(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sending could not be confirmed.");
      // A real request may have reached the provider; do not automatically retry it.
      if (!testMode) setAttempted(true);
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };

  return <section aria-label="Communication confirmation" className="nia-communication">
    <strong className="flex items-center gap-2 text-primary">{draft.kind === "call" ? <Phone size={15} /> : <Mail size={15} />}{draft.kind === "call" ? "Call draft" : "Email draft"} · {testMode ? "TEST MODE" : "REAL SEND"}</strong>
    <dl className="my-2 text-sm"><dt className="text-muted-foreground">To</dt><dd className="m-0 break-all">{draft.recipient}</dd>{draft.kind === "email" && <><dt className="mt-2 text-muted-foreground">Subject</dt><dd className="m-0 break-words">{draft.subject}</dd></>}</dl>
    <p className="whitespace-pre-wrap break-words">{draft.message}</p>
    {!testMode && <label className="mt-3">Operator passcode<input aria-label="Operator passcode" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} disabled={busy || attempted} className="mt-1 w-full rounded border border-input bg-muted p-2 text-foreground" /></label>}
    {error && <div role="alert" className="nia-error mt-2">{error}</div>}
    {attempted && error && <p>Sending is not confirmed. Check the provider before creating another request.</p>}
    <div className="flex gap-2 mt-2">
      <Button variant="action" className="flex-1 min-w-0" disabled={busy || attempted || (!testMode && !token.trim())} onClick={confirm}><Check />{busy ? "Processing…" : testMode ? "Confirm simulation" : draft.kind === "call" ? "Confirm real call" : "Confirm real email"}</Button>
      <Button variant="console" className="shrink-0" disabled={busy} onClick={() => onCancel(attempted)}><X />{attempted ? "Close" : "Cancel"}</Button>
    </div>
  </section>;
}