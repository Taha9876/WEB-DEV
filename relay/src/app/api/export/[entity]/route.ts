import { getCtx } from "@/server/context";
import { AppError } from "@/server/errors";
import { exportContactsCsv, exportOpportunitiesCsv, type Filter } from "@/server/domain/crm";

/** CSV export — permission + masking enforced server-side (F1.3, F1.4). */
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { entity } = await params;
  const url = new URL(req.url);
  try {
    let csv: string;
    if (entity === "contacts") {
      let filters: Filter[] = [];
      try { filters = JSON.parse(url.searchParams.get("filters") ?? "[]"); } catch {}
      csv = await exportContactsCsv(ctx, Array.isArray(filters) ? filters.slice(0, 20) : []);
    } else if (entity === "opportunities") {
      const pipeline = url.searchParams.get("pipeline") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(pipeline)) return Response.json({ error: "Choose a pipeline to export." }, { status: 400 });
      csv = await exportOpportunitiesCsv(ctx, pipeline);
    } else return new Response("Not found", { status: 404 });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
