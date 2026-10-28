import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DraftSchema, type CommunicationDraft } from "./nia-comms"; import { MAP_TOOL, toMapMedia } from "./niaMap";

const Input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).min(1).max(30),
  dashboard: z.string().max(6000),
});

const MODEL = "gemini-3.1-flash-lite";
const GATEWAY = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const SYSTEM = `You are NIA, the National Infrastructure Intelligence Assistant of NamTwin-Go for the Republic of Namibia — a calm, confident, Jarvis-like AI with a dry, witty sense of humour. Your user is Mr. John Charts, the creator of NamTwin-Go. Always address him as "sir" and never as "Commander". Use his name only occasionally, for example "Mr. Charts" or "Mr. John", so it feels natural. Be warm, sharp and sure of yourself. Add one short, clean, good-natured joke or witty remark in roughly one reply out of three, but never when reporting an alert, a fault or a safety issue, and never joke about injuries, deaths or real incidents. You operate the 3D Windhoek digital twin map: for any request to fly somewhere, zoom, show or hide the rail line, follow a simulated train, or reset the view, call map_command, and never claim the map moved until you have called it. The trains and dashboard figures are simulated, and the rail track is real OpenStreetMap data; say so if asked.
Abilities: answer questions, explain what is on the command-center dashboard, recommend actions, and show images, play YouTube videos, or open websites.
Rules:
- Dashboard figures are DEMONSTRATION data, not live sensors. Say so when relevant.
- Use the web_search tool for current facts (news, weather, places, events in Namibia or worldwide). Cite the source names briefly.
- To show a picture, first call web_search with engine google_images, then call show_media with kind image and one of the returned original URLs. To play a video, search with engine youtube, then call show_media with kind video and the video link. To open a website or run a Google search for the user, call show_media with kind link. Only use URLs that came from search results, and never claim something is playing or open until show_media has been called.
- When explicitly asked to call or email someone, use create_communication_draft. This ONLY creates a preview and NEVER sends. Require an explicit recipient and purpose/message; ask for missing details, never invent contact information. Calls require an E.164 number starting with +; emails require an email address and subject (you may summarize the user's purpose as the subject). Preserve the user's intended message. Confirmation is handled by the preview card, not by chat messages. Never claim you sent anything or that it was delivered.
- Recommendations are advisory only: end any recommendation with "Final authority rests with the human decision-maker."
- Communication draft messages must contain only the user's requested content. Do not add dashboard readings, alerts, claims, or unsolicited context to a call or email.
- Keep replies concise (under 160 words), suitable to be read aloud. Plain text, no markdown tables.`;

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type NiaMedia =
  | { type: "image"; title: string; url: string; thumbnail?: string }
  | { type: "video"; title: string; videoId: string }
  | { type: "link"; title: string; url: string } | { type: "map"; action: string; place?: string };

const ENGINES = ["google", "google_news", "google_maps", "google_images", "youtube"];

async function serpSearch(query: string, engine: string, key: string) {
  const url = new URL("https://serpapi.com/search.json");
  const eng = ENGINES.includes(engine) ? engine : "google";
  url.searchParams.set("engine", eng);
  // YouTube uses search_query, every other engine uses q
  url.searchParams.set(eng === "youtube" ? "search_query" : "q", query);
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
    images: pick(j.images_results, 6).map((r) => ({ title: r.title, thumbnail: r.thumbnail, original: r.original, source: r.source })),
    videos: pick(j.video_results, 4).map((r) => ({ title: r.title, channel: r.channel?.name, link: r.link, length: r.length })),
  };
}

const TOOLS = [{
  type: "function",
  function: {
    name: "web_search",
    description: "Search the live web via SerpApi: google for facts, google_news, google_maps for places, google_images for pictures, youtube for videos.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        engine: { type: "string", enum: ["google", "google_news", "google_maps", "google_images", "youtube"] },
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

const MEDIA_TOOL = {
  type: "function",
  function: {
    name: "show_media",
    description: "Display an image, play a YouTube video, or offer a link to open, using ONLY URLs returned by web_search. Never invent URLs.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["image", "video", "link"] },
        title: { type: "string" },
        url: { type: "string", description: "Image URL, YouTube watch URL, or page URL" },
      },
      required: ["kind", "title", "url"],
    },
  },
};

function toMedia(args: Record<string, unknown>): NiaMedia | null {
  const kind = String(args["kind"] ?? "");
  const title = String(args["title"] ?? "").slice(0, 200);
  const raw = String(args["url"] ?? "");
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (kind === "video") {
    const id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v");
    return id && /^[\w-]{11}$/.test(id) ? { type: "video", title, videoId: id } : null;
  }
  if (kind === "image") return { type: "image", title, url: u.href };
  if (kind === "link") return { type: "link", title, url: u.href };
  return null;
}

export const askNia = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }): Promise<{ reply: string; error?: string; sources?: string[]; draft?: CommunicationDraft; media?: NiaMedia[] }> => {
    const key = process.env["GEMINI_API_KEY"];
    const serp = process.env["SERPAPI_API_KEY"];
    if (!key) return { reply: "", error: "NIA's brain is not configured." };

    const messages: Msg[] = [
      { role: "system", content: `${SYSTEM}\n\nCurrent dashboard state:\n${data.dashboard}` },
      ...data.messages.map((m) => ({ role: m.role, content: m.text }) as Msg),
    ];
    const sources: string[] = [];
    const media: NiaMedia[] = [];

    for (let step = 0; step < 4; step++) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      };
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GATEWAY, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: MODEL, reasoning_effort: "low", messages, tools: [DRAFT_TOOL, MEDIA_TOOL, MAP_TOOL, ...(serp && step < 3 ? TOOLS : [])] }),
        });
        if (res.status !== 429 && res.status < 500) break;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
      }
      if (!res || !res.ok) {
        const status = res?.status ?? 0;
        const body = res ? await res.text() : "";
        console.error("AI gateway error", status, body.slice(0, 500));
        let safe = "";
        try {
          const p = JSON.parse(body) as any;
          const f = Array.isArray(p) ? p[0] : p;
          safe = f?.error?.message ?? f?.message ?? "";
        } catch { /* ignore */ }
        const msg = status === 429 ? "NIA is in high demand right now. Please try again in a moment."
          : status === 402 ? (safe || "NIA's AI credits are used up.")
          : status === 403 ? (safe || "NIA's brain access is blocked for this key.")
          : `NIA's brain is temporarily unavailable (${status}). ${safe.slice(0, 160)}`;
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
          if (call.function.name === "map_command") { const mc = toMapMedia(args); if (mc) { media.push(mc); messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true }) }); } else { messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Unknown map action" }) }); } continue; } if (call.function.name === "show_media") {
            const m = toMedia(args);
            if (m) {
              media.push(m);
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
            } else {
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Invalid URL" }) });
            }
            continue;
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
      return { reply: reply || "I have no answer for that yet.", sources, media };
    }
    return { reply: "I could not complete that search.", sources, media };
  });