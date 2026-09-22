import { createServerFn } from "@tanstack/react-start";
import type { AiEvidence } from "@/lib/synaptick/evidence";

export const aiStatus = createServerFn({ method: "POST" }).handler(async () => {
  return { available: Boolean(process.env.XAI_API_KEY) };
});

export const runAiResearch = createServerFn({ method: "POST" })
  .validator(
    (input: {
      symbol: string;
      regime: string;
      alignment: number;
      rsi: number;
      netEdge: number;
      analogNote: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<{ ok: true; evidence: AiEvidence } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI research is unavailable in this environment" };

    const prompt = `You are the Synaptick research desk. Produce EVIDENCE only — never a trade instruction.
Do not say BUY, SELL, or WAIT as a decision. The deterministic gate decides.

Snapshot (point-in-time market stats, not a live news wire):
symbol ${data.symbol}
regime ${data.regime}
alignment ${data.alignment}
rsi ${data.rsi}
brain net edge ${data.netEdge}
analogs ${data.analogNote}

Return JSON only:
{
  "technical": number from -0.2 to 0.2,
  "sentiment": number from -0.2 to 0.2,
  "news": number from -0.2 to 0.2,
  "fundamental": number from -0.2 to 0.2,
  "bull": "one sentence for the bull researcher",
  "bear": "one sentence for the bear researcher",
  "risk": "one sentence for the risk analyst",
  "notes": [
    {"role":"technical","text":"..."},
    {"role":"sentiment","text":"..."},
    {"role":"news","text":"..."},
    {"role":"fundamental","text":"..."}
  ]
}
News/sentiment must be labeled as model knowledge, not a point-in-time wire. Keep each text under 240 characters.`;

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0.3,
        }),
      });
      if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < jsonStart) return { ok: false, error: "AI returned no JSON" };
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AiEvidence;
      const clamp = (n: unknown) => Math.max(-0.2, Math.min(0.2, Number(n) || 0));
      return {
        ok: true,
        evidence: {
          technical: clamp(parsed.technical),
          sentiment: clamp(parsed.sentiment),
          news: clamp(parsed.news),
          fundamental: clamp(parsed.fundamental),
          bull: String(parsed.bull ?? "").slice(0, 280),
          bear: String(parsed.bear ?? "").slice(0, 280),
          risk: String(parsed.risk ?? "").slice(0, 280),
          notes: Array.isArray(parsed.notes)
            ? parsed.notes.slice(0, 4).map((n) => ({
                role: String(n.role ?? "").slice(0, 24),
                text: String(n.text ?? "").slice(0, 280),
              }))
            : [],
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "AI research failed" };
    }
  });
