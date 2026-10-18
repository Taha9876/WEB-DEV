/** Instant feedback on every app navigation while the server streams the page. */
export default function Loading() {
  return (
    <div className="animate-pulse px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-28 rounded-full bg-foreground/10" />
      <div className="mt-3 h-10 w-72 max-w-full rounded-2xl bg-foreground/10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-36 rounded-3xl bg-foreground/[0.06]" />)}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="h-72 rounded-3xl bg-foreground/[0.06]" /><div className="h-72 rounded-3xl bg-foreground/[0.06]" />
      </div>
    </div>
  );
}
