import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DraftSchema, type CommunicationDraft } from "./nia-comms";

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).min(1).max(30),
  dashboard: z.string().max(6000),
});

const MODEL = "google/gemini-3.8-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM = `You are NIA, the National Infrastructure Intelligence Assistant of NamTwin-Go for the Republic of Namibia — a calm, confident, Jarvis-like AI.
Abilities: answer questions, explain what is on the command-center dashboard, and recommend actions.
Rules:
- Dashboard figures are DEMONSTRATION data, not live sensors. Say so when relevant.
- Use the web_search tool for current facts (news, weather, places, events in Namibia or worldwide). Cite the source names briefly.
- When explicitly asked to call or email someone, use create_communication_draft. This ONLY creates a preview and NEVER sends. Require an explicit recipient and purpose/message; ask for missing details, never invent contact information. Calls require an E.164 number starting with +; emails require an email address and subject (you may summarize the user's purpose as the subject). Preserve the user's intended message. Confirmation is handled by the preview card, not by chat messages. Never claim you sent anything or that it was delivered.
- Recommendations are advisory only: end any recommendation with "Final authority rests with the human decision-maker."
- Communication draft messages must contain only the user's requested content. Do not add dashboard readings, alerts, claims, or unsolicited context to a call or email.
- Keep replies concise (under 160 words), suitable to be read aloud. Plain text, no markdown tables.`;

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function serpSearch(query: string, engine: string, key: string) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", ["google", "google_news", "google_maps"].includes(engine) ? engine : "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const res = await fetch(url);
  if (!res.ok) return { error: `Search failed (${res.status})` };
  const j = (await res.json()) as any;
  const pick = (arr: any[] | undefined, n = 5) => (arr ?? []).slice(0, n);
  return {
    answer: j.answer_box?.answer ?? j.answer_box?.snippet ?? null,
    results: pick(j.organic_results).map((r) => ({ title: r.title, snippet: r.snippet, source: r.source ?? r.link })),
    news: pick(j.news_results).map((r) => ({ title: r.title, source: r.source?.name ?? r.source, date: r.date })),
    places: pick(j.local_results).map((r) => ({ title: r.title, address: r.address, rating: r.rating })),
  };
}

const TOOLS = [{
  type: "function",
  function: {
    name: "web_search",
    description: "Search the live web via SerpApi for current news, facts, weather or places.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        engine: { type: "string", enum: ["google", "google_news", "google_maps"] },
      },
      required: ["query"],
    },
  },
}];
const DRAFT_TOOL = {
  type: "function",
  function: {
    name: "create_communication_draft",
    description: "Create a call or email preview ONLY when the user explicitly asks. No transmission occurs.",
    parameters: {
      type: "object",
      properties: { kind: { type: "string", enum: ["call", "email"] }, recipient: { type: "string" }, subject: { type: "string" }, message: { type: "string" } },
      required: ["kind", "recipient", "subject", "message"],
    },
  },
};

export const askNia = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ reply: string; error?: string; sources?: string[]; draft?: CommunicationDraft }> => {
    const key = process.env["LOVABLE_API_KEY"];
    const serp = process.env["SERPAPI_API_KEY"];
    if (!key) return { reply: "", error: "NIA's brain is not configured." };

    const messages: Msg[] = [
      { role: "system", content: `${SYSTEM}\n\nCurrent dashboard state:\n${data.dashboard}` },
      ...data.messages.map((m) => ({ role: m.role, content: m.text }) as Msg),
    ];
    const sources: string[] = [];
    let runId: string | undefined;

    for (let step = 0; step < 3; step++) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "Lovable-API-Key": key,
        Authorization: `Bearer ${key}`,
        "X-Lovable-AIG-SDK": "fetch",
      };
      if (runId) headers["X-Lovable-AIG-Run-ID"] = runId;
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GATEWAY, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: MODEL, messages, tools: [DRAFT_TOOL, ...(serp && step < 2 ? TOOLS : [])] }),
        });
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
      }
      runId ??= res?.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        const body = res ? await res.text() : "";
        console.error("AI gateway error", status, body.slice(0, 500));
        let safe = "";
        try { safe = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? ""; } catch { /* ignore */ }
        const msg = status === 429 ? "NIA is in high demand right now. Please try again in a moment."
          : status === 402 ? (safe || "NIA's AI credits are used up. Add credits in workspace settings.")
          : status === 403 ? (safe || "NIA's brain access is blocked for this workspace.")
          : "NIA's brain is temporarily unavailable.";
        return { reply: "", error: msg };
      }
      const j = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
      const msg = j.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (calls.length) {
        messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: calls });
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
          if (call.function.name === "create_communication_draft") {
            const parsed = DraftSchema.safeParse(args);
            if (!parsed.success) return { reply: "Please provide a valid international phone number or email address, and the message to send (plus a subject for email)." };
            return { reply: "Your draft is ready for review. Nothing has been sent.", draft: parsed.data, sources };
          }
          if (call.function.name !== "web_search" || !serp) {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Tool unavailable" }) });
            continue;
          }
          const q = String(args["query"] ?? "");
          const engine = String(args["engine"] ?? "google");
          sources.push(`${engine.replace("google_", "")}: ${q}`);
          const result = await serpSearch(q, engine, serp).catch(() => ({ error: "Search unavailable" }));
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
        continue;
      }
      const reply = (msg?.content ?? "").trim();
      return { reply: reply || "I have no answer for that yet.", sources };
    }
    return { reply: "I could not complete that search.", sources };
  });
