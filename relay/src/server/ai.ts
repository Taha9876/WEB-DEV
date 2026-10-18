import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Thin Claude client. AI is an enhancement layer: when it is not configured or a call fails,
 * callers get an AiUnavailable error and the rest of the platform carries on (I5.8).
 */
const MODEL = "claude-opus-5-5";
// Server-side refusal fallback: on a policy decline the API re-runs on a suitable model in the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const };

export class AiUnavailable extends Error {}

let client: Anthropic | null | undefined;
function getClient() {
  if (client === undefined) {
    try { client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 45_000, maxRetries: 2 }) : null; } catch { client = null; }
  }
  if (!client) throw new AiUnavailable("AI isn't configured. Add ANTHROPIC_API_KEY to the server environment to enable Relay AI.");
  return client;
}
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

async function structured<T extends z.ZodType>(schema: T, system: string, user: string, effort: "low" | "medium" = "low"): Promise<z.infer<T>> {
  try {
    const res = await getClient().beta.messages.parse({
      model: MODEL, max_tokens: 4000, system, ...FALLBACK,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: user }],
    });
    const r = res as unknown as { stop_reason: string; parsed_output: z.infer<T> | null };
    if (r.stop_reason === "refusal" || !r.parsed_output) throw new AiUnavailable("The AI declined or returned an unreadable answer for this request.");
    return r.parsed_output;
  } catch (e) {
    if (e instanceof AiUnavailable) throw e;
    throw new AiUnavailable(e instanceof Anthropic.APIError ? `AI request failed (${e.status ?? "network"}). Try again in a moment.` : "AI request failed. Try again in a moment.");
  }
}

async function text(system: string, user: string, effort: "low" | "medium" = "low") {
  try {
    const res = await getClient().beta.messages.create({
      model: MODEL, max_tokens: 2000, system, ...FALLBACK, output_config: { effort },
      messages: [{ role: "user", content: user }],
    }) as unknown as Anthropic.Beta.BetaMessage;
    if (res.stop_reason === "refusal") throw new AiUnavailable("The AI declined to draft this message.");
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  } catch (e) {
    if (e instanceof AiUnavailable) throw e;
    throw new AiUnavailable(e instanceof Anthropic.APIError ? `AI request failed (${e.status ?? "network"}). Try again in a moment.` : "AI request failed. Try again in a moment.");
  }
}

/* ------------------------------------------------------------------ 1. Lead triage */
export type FieldSpec = { key: string; label: string; type: string; options: string[] };

export const TriageSchema = z.object({
  intent: z.string().describe("What the customer wants, 3-8 words"),
  urgency: z.number().int().min(0).max(100).describe("0 = browsing, 100 = needs help today / ready to buy now"),
  language: z.string().describe("Language the customer wrote in, e.g. English, Urdu, Roman Urdu"),
  summary: z.string().describe("One sentence a salesperson can read in 3 seconds"),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe("Values for the provided custom fields that the message states explicitly"),
  tags: z.array(z.string()).max(4).describe("Short lowercase tags, e.g. 'hot', 'price-sensitive'"),
});
export type Triage = z.infer<typeof TriageSchema>;

export function triageLead(input: { company: string; message: string; source: string; fields: FieldSpec[] }) {
  return structured(TriageSchema,
    `You triage inbound sales leads for ${input.company}, a service business. Be factual: only extract what the customer actually said. ` +
    `For fields, use only the keys listed; for dropdowns use one of the listed options exactly; for dates use YYYY-MM-DD; omit anything not stated.`,
    `Source: ${input.source}\nCustom fields available:\n${input.fields.map((f) => `- ${f.key} (${f.label}, ${f.type}${f.options.length ? `: ${f.options.join(" | ")}` : ""})`).join("\n") || "(none)"}\n\nCustomer message:\n"""${input.message.slice(0, 4000)}"""`);
}

/* ------------------------------------------------------------------ 2. Reply drafting */
export function draftReply(ctx: { company: string; agent: string; customer: string; record: string; history: { from: "customer" | "us"; text: string }[] }) {
  return text(
    `You write WhatsApp replies for ${ctx.agent} at ${ctx.company}. Reply in the customer's language and tone. Keep it under 70 words, warm and specific, ` +
    `with one clear next step (a call, a visit, a payment link, a time). Never invent prices, dates or facts not in the record. Output only the message text.`,
    `Customer: ${ctx.customer}\nCRM record:\n${ctx.record}\n\nConversation (oldest first):\n${ctx.history.map((m) => `${m.from === "us" ? "Us" : "Customer"}: ${m.text}`).join("\n") || "(no messages yet)"}\n\nWrite the next message from us.`,
    "medium",
  );
}

/** Safety net: an instant, honest acknowledgement when nobody has responded in time. */
export function firstResponse(ctx: { company: string; customer: string; message: string; ownerFirstName: string | null }) {
  return text(
    `You send a brief automated first reply on WhatsApp for ${ctx.company}. Reply in the customer's language. Under 45 words. ` +
    `Thank them, restate their request in a few words, say ${ctx.ownerFirstName ? `${ctx.ownerFirstName} from the team` : "a team member"} will follow up shortly. ` +
    `Make clear this is an automated message. Do not promise prices or times. Output only the message text.`,
    `Customer: ${ctx.customer}\nTheir message: """${ctx.message.slice(0, 2000)}"""`,
  );
}

/* ------------------------------------------------------------------ 3. Natural language → filters */
export const FilterSchema = z.object({
  filters: z.array(z.object({ field: z.string(), value: z.string() })),
  explanation: z.string().describe("One short sentence describing the list, e.g. 'Hot solar leads created this week owned by Bilal'"),
});

export function nlToFilters(query: string, catalog: { field: string; label: string; values?: { id: string; name: string }[] }[], today: string) {
  return structured(FilterSchema,
    `Convert a CRM search request into filters. Use only fields from the catalog. When a field lists values, the value must be one of the listed ids. ` +
    `Dates are YYYY-MM-DD; today is ${today}. Use field "q" for free-text name/email/phone search only when nothing else fits. Return an empty list if nothing matches.`,
    `Catalog:\n${catalog.map((c) => `- ${c.field}: ${c.label}${c.values ? ` [${c.values.slice(0, 60).map((v) => `${v.id}=${v.name}`).join(", ")}]` : ""}`).join("\n")}\n\nRequest: ${query}`);
}

/* ------------------------------------------------------------------ 4. Manager briefing */
export const BriefingSchema = z.object({
  headline: z.string().describe("One sentence, the most important thing right now"),
  points: z.array(z.string()).max(4).describe("Specific, actionable observations with names and numbers"),
});
export function briefing(facts: string) {
  return structured(BriefingSchema,
    "You brief the manager of a small sales team. Use only the facts given. Be specific: names, counts, durations. No generic advice.",
    facts, "low");
}
