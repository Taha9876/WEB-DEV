export function money(cents: number | null | undefined, currency = "USD", compact = false) {
  if (cents === null || cents === undefined) return "••••";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: compact || cents % 100 === 0 ? 0 : 2, notation: compact ? "compact" : "standard" }).format(cents / 100);
}

export function dateTime(d: Date | string | number, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(d));
}

export function relative(d: Date | string | number, now = Date.now()) {
  const s = Math.round((now - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(-s, "second");
  if (abs < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}
