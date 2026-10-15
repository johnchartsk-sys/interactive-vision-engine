import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).min(1).max(30),
  dashboard: z.string().max(6000),
});

const SYSTEM = `You are NIA, the National Infrastructure Intelligence Assistant of NamTwin-Go for the Republic of Namibia — a calm, confident, Jarvis-like AI.
Abilities: answer questions, explain what is on the command-center dashboard, and recommend actions.
Rules:
- Dashboard figures are DEMONSTRATION data, not live sensors. Say so when relevant.
- Use the web_search tool for current facts (news, weather, places, events in Namibia or worldwide). Cite the source names briefly.
- Recommendations are advisory only: end any recommendation with "Final authority rests with the human decision-maker."
- Keep replies concise (under 160 words), suitable to be read aloud. Plain text, no markdown tables.`;

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: unknown };
type Content = { role: "user" | "model" | "function"; parts: Part[] };

async function serpSearch(query: string, engine: string, key: string) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", ["google", "google_news", "google_maps"].includes(engine) ? engine : "google");
  url.searchParams.set(engine === "google_maps" ? "q" : "q", query);
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

export const askNia = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const gemini = process.env["GEMINI_API_KEY"];
    const serp = process.env["SERPAPI_API_KEY"];
    if (!gemini) return { reply: "", error: "NIA's brain key is not configured." };

    const contents: Content[] = data.messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
    const sources: string[] = [];
    const body = () => ({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\nCurrent dashboard state:\n${data.dashboard}` }] },
      contents,
      tools: serp ? [{ functionDeclarations: [{
        name: "web_search",
        description: "Search the live web via SerpApi.",
        parameters: { type: "OBJECT", properties: {
          query: { type: "STRING" },
          engine: { type: "STRING", enum: ["google", "google_news", "google_maps"] },
        }, required: ["query"] },
      }] }] : undefined,
    });

    for (let step = 0; step < 3; step++) {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": gemini },
          body: JSON.stringify(body()),
        });
        if (res.status !== 503) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        console.error("Gemini error", status, res ? (await res.text()).slice(0, 500) : "no response");
        const msg = status === 429 || status === 503 ? "NIA is in high demand right now. Please try again in a moment."
          : status === 400 || status === 401 || status === 403 ? "NIA's Gemini key was rejected. Please check the key."
          : "NIA's brain is temporarily unavailable.";
        return { reply: "", error: msg };
      }
      const j = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      const call = parts.find((p) => p.functionCall)?.functionCall;
      if (call && serp && step < 2) {
        const q = String(call.args["query"] ?? "");
        const engine = String(call.args["engine"] ?? "google");
        sources.push(`${engine.replace("google_", "")}: ${q}`);
        const result = await serpSearch(q, engine, serp).catch(() => ({ error: "Search unavailable" }));
        contents.push({ role: "model", parts });
        contents.push({ role: "user", parts: [{ functionResponse: { name: call.name, response: { result } } } as Part] });
        continue;
      }
      const reply = parts.map((p) => p.text ?? "").join("").trim();
      return { reply: reply || "I have no answer for that yet.", sources };
    }
    return { reply: "I could not complete that search.", sources };
  });
