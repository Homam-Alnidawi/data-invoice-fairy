import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverview, listUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/statistics")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الإحصائيات — إدارة دفتر" },
      { name: "description", content: "تحليل استخدام النظام: المعالجة، التصدير، وأكثر المستخدمين نشاطًا." },
      { property: "og:title", content: "الإحصائيات — إدارة دفتر" },
      { property: "og:description", content: "تقارير استهلاك ومعالجة الفواتير." },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const ov = useServerFn(adminOverview);
  const lu = useServerFn(listUsers);
  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => ov() });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => lu() });

  const top = useMemo(
    () =>
      [...(users.data ?? [])]
        .sort((a, b) => b.invoicesProcessed - a.invoicesProcessed)
        .slice(0, 10),
    [users.data],
  );

  if (overview.isLoading || users.isLoading)
    return <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (!overview.data) return <div className="text-sm text-destructive">تعذّر تحميل البيانات</div>;

  const d = overview.data;
  const max = Math.max(1, ...d.daily.map((x) => x.count));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">Statistics</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-bold">الفواتير المعالجة يوميًا</div>
        <div className="mt-4 flex h-48 items-end gap-1">
          {d.daily.map((x) => (
            <div key={x.day} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] tabular-nums text-muted-foreground">{x.count || ""}</span>
              <div
                className="w-full rounded-t bg-brand/80"
                style={{ height: `${(x.count / max) * 100}%`, minHeight: 2 }}
              />
              <span className="text-[9px] text-muted-foreground">{x.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold">أنواع التصدير</div>
          <ul className="mt-3 space-y-3 text-[12px]">
            {[
              ["Excel", d.excelExports],
              ["PDF", d.pdfExports],
            ].map(([label, v]) => {
              const total = Math.max(1, d.excelExports + d.pdfExports);
              return (
                <li key={String(label)}>
                  <div className="flex justify-between">
                    <span>{label}</span>
                    <b className="tabular-nums">{v}</b>
                  </div>
                  <div className="mt-1 h-2 rounded bg-muted">
                    <div
                      className="h-2 rounded bg-foreground"
                      style={{ width: `${(Number(v) / total) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold">أكثر 10 مستخدمين معالجةً</div>
          <ul className="mt-3 divide-y divide-border text-[12px]">
            {top.length === 0 && <li className="py-2 text-muted-foreground">لا توجد بيانات</li>}
            {top.map((u) => (
              <li key={u.id} className="flex justify-between gap-2 py-2">
                <span className="truncate" dir="ltr">
                  {u.email ?? u.id}
                </span>
                <b className="tabular-nums">{u.invoicesProcessed}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
