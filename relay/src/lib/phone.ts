/** Normalise to E.164 (+ and 8–15 digits). Returns null when it can't be a phone number. */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/^whatsapp:/i, "").replace(/[\s\-().]/g, "");
  const n = s.startsWith("00") ? "+" + s.slice(2) : s;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}
