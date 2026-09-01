import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الإعدادات وسجل الإدارة — دفتر" },
      { name: "description", content: "حدود الخطط وسجل تدقيق الإجراءات الإدارية في دفتر." },
      { property: "og:title", content: "الإعدادات وسجل الإدارة — دفتر" },
      { property: "og:description", content: "سجل تدقيق كامل لكل إجراء إداري." },
    ],
  }),
  component: SettingsPage,
});

const fmt = (v: string) => new Date(v).toLocaleString("ar-EG");

function SettingsPage() {
  const fn = useServerFn(listAuditLog);
  const { data, isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">Settings</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">حدود الخطط الحالية</h2>
        <ul className="mt-3 space-y-2 text-[12px]">
          <li className="flex justify-between">
            <span className="text-muted-foreground">زائر بدون حساب</span>
            <b>فاتورتان</b>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">حساب مجاني</span>
            <b>5 فواتير شهريًا</b>
          </li>
          <li className="flex justify-between">
            <span className="text-muted-foreground">اشتراك Pro</span>
            <b>1000 فاتورة شهريًا</b>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">سجل تدقيق الإجراءات الإدارية</h2>
        {isLoading && <p className="mt-2 text-[12px] text-muted-foreground">جارٍ التحميل…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">لا توجد إجراءات مسجّلة</p>
        )}
        {(data?.length ?? 0) > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-right text-[12px]">
              <thead className="bg-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2">الإجراء</th>
                  <th className="p-2">المدير</th>
                  <th className="p-2">المستخدم المستهدف</th>
                  <th className="p-2">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data!.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-bold">{r.action}</td>
                    <td className="p-2" dir="ltr">
                      {r.adminEmail ?? "—"}
                    </td>
                    <td className="p-2" dir="ltr">
                      {r.targetEmail ?? r.targetUserId ?? "—"}
                    </td>
                    <td className="p-2">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
