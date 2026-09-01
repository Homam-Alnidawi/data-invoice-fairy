import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverview } from "@/lib/admin.functions";
import { adminSubscriptionStats } from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — دفتر" },
      { name: "description", content: "إحصائيات المستخدمين وعمليات معالجة الفواتير في دفتر." },
      { property: "og:title", content: "لوحة الإدارة — دفتر" },
      { property: "og:description", content: "نظرة عامة على المستخدمين والاستهلاك." },
    ],
  }),
  component: AdminHome,
});

function Card({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function AdminHome() {
  const fn = useServerFn(adminOverview);
  const subFn = useServerFn(adminSubscriptionStats);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn(),
    retry: false,
  });
  const subs = useQuery({
    queryKey: ["admin-sub-stats"],
    queryFn: () => subFn(),
    retry: false,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (error || !data)
    return <div className="text-sm text-destructive">تعذّر تحميل الإحصائيات</div>;

  const max = Math.max(1, ...data.daily.map((d) => d.count));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="إجمالي المستخدمين" value={data.totalUsers} />
        <Card label="المستخدمون النشطون" value={data.activeUsers} />
        <Card label="المعطلون" value={data.disabledUsers} />
        <Card label="مستخدمون جدد (30 يومًا)" value={data.newUsers30d} />
        <Card label="عمليات المعالجة" value={data.processingOperations} />
        <Card label="الفواتير المعالجة" value={data.invoicesProcessed} />
        <Card label="ملفات Excel" value={data.excelExports} />
        <Card label="ملفات PDF" value={data.pdfExports} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">Subscriptions</h2>
        {subs.data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Total Users" value={subs.data.totalUsers} />
            <Card label="Free Users" value={subs.data.freeUsers} />
            <Card label="Pro Users" value={subs.data.proUsers} />
            <Card label="Active Subscriptions" value={subs.data.activeSubscriptions} />
            <Card label="Expired Subscriptions" value={subs.data.expiredSubscriptions} />
            <Card label="Admin Granted" value={subs.data.adminGranted} />
            <Card label="Paid Subscriptions" value={subs.data.paidSubscriptions} />
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">جارٍ تحميل بيانات الاشتراكات…</div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <div className="text-sm font-bold">الفواتير المعالجة — آخر 14 يومًا</div>
          <div className="mt-4 flex h-40 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-brand/80"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }}
                  title={`${d.day}: ${d.count}`}
                />
                <span className="text-[9px] text-muted-foreground">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-bold">استهلاك النظام</div>
          <ul className="mt-3 space-y-2 text-[12px]">
            <li className="flex justify-between">
              <span className="text-muted-foreground">رفعات مؤقتة</span>
              <b className="tabular-nums">{data.tempUploads}</b>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">تجارب الزوار</span>
              <b className="tabular-nums">{data.guestRuns}</b>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">إجمالي التقارير</span>
              <b className="tabular-nums">{data.excelExports + data.pdfExports}</b>
            </li>
          </ul>
          <div className="mt-4 text-sm font-bold">الأكثر استخدامًا</div>
          <ul className="mt-2 space-y-1 text-[12px]">
            {data.topUsers.length === 0 && (
              <li className="text-muted-foreground">لا توجد بيانات بعد</li>
            )}
            {data.topUsers.map((u) => (
              <li key={u.email ?? Math.random()} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground" dir="ltr">
                  {u.email ?? "—"}
                </span>
                <b className="tabular-nums">{u.invoices}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
