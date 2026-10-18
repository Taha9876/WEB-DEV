import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { requireCtx } from "@/server/context";
import { upcoming } from "@/server/domain/appointments";
import { PageHeader, EmptyState, Avatar } from "@/components/app/static";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const ctx = await requireCtx();
  const mine = (await searchParams).mine === "1";
  const rows = await upcoming(ctx, mine);
  const tz = ctx.user.timezone;
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
  const time = (d: Date, z = tz) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: z }).format(d);
  const groups = rows.reduce<Record<string, typeof rows>>((g, r) => ((g[day(r.startsAt)] ??= []).push(r), g), {});

  return (
    <div>
      <PageHeader title="Appointments" description={`Upcoming bookings, shown in your time zone (${tz}). Each one lives on the employee's real Google Calendar.`}>
        {ctx.can("crm.view_all") && (
          <div className="flex rounded-lg border border-input p-0.5 text-sm">
            <Link href="/appointments" className={`rounded-md px-3 py-1 ${!mine ? "bg-accent" : "text-muted-foreground"}`}>Team</Link>
            <Link href="/appointments?mine=1" className={`rounded-md px-3 py-1 ${mine ? "bg-accent" : "text-muted-foreground"}`}>Mine</Link>
          </div>
        )}
      </PageHeader>
      {!rows.length ? <EmptyState icon={CalendarDays} title="No upcoming appointments" body="Book one from a contact or opportunity." /> : (
        <div className="space-y-8 px-4 py-6 sm:px-8">
          {Object.entries(groups).map(([d, items]) => (
            <section key={d}>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">{d}</h2>
              <ul className="space-y-2">
                {items.map((a) => (
                  <li key={a.id}>
                    <Link href={`/contacts/${a.contactId}`} className="edge flex items-center gap-4 rounded-2xl p-4 transition-transform hover:-translate-y-0.5">
                      <div className="w-20 shrink-0 font-mono text-sm tabular">{time(a.startsAt)}<span className="block text-[11px] text-muted-foreground">{time(a.endsAt)}</span></div>
                      <div className="min-w-0 flex-1"><p className="font-medium">{a.title}</p><p className="text-sm text-muted-foreground">{a.contactFirst} {a.contactLast}</p>
                        {a.timezone !== tz && <p className="text-[11px] text-muted-foreground">{time(a.startsAt, a.timezone)} in {a.timezone}</p>}</div>
                      <span className="flex items-center gap-2 text-sm"><Avatar name={a.userName} />{a.userName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
