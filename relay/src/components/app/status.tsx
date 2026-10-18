export type Status = "available" | "busy" | "on_leave" | "offline";

export const STATUS_LABEL: Record<Status, string> = { available: "Available", busy: "Busy", on_leave: "On leave", offline: "Offline" };

// Shape + colour, so status never relies on colour alone (Q8).
export function StatusDot({ status, className = "" }: { status: Status; className?: string }) {
  const s = {
    available: "bg-ok",
    busy: "bg-warn [clip-path:polygon(50%_0,100%_100%,0_100%)] rounded-none",
    on_leave: "bg-leave rounded-[2px]",
    offline: "border-2 border-idle bg-transparent",
  }[status];
  return <span role="img" aria-label={STATUS_LABEL[status]} className={`inline-block size-2.5 shrink-0 rounded-full ${s} ${className}`} />;
}
