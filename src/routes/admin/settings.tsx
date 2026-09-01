import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAuditLog } from "@/lib/admin.functions";
import { adminExpireDue, adminListPlans, adminUpdatePlan } from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/admin/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الخطط وسجل الإدارة — دفتر" },
      { name: "description", content: "إدارة خطط الاشتراك وحدودها وسجل تدقيق الإجراءات في دفتر." },
      { property: "og:title", content: "الخطط وسجل الإدارة — دفتر" },
      { property: "og:description", content: "تعديل حدود وأسعار الخطط وسجل تدقيق كامل." },
    ],
  }),
  component: SettingsPage,
});

const fmt = (v: string) => new Date(v).toLocaleString("ar-EG");

type Draft = { priceCents: string; invoiceLimit: string; processingLimit: string };

function SettingsPage() {
  const qc = useQueryClient();
  const auditFn = useServerFn(listAuditLog);
  const plansFn = useServerFn(adminListPlans);
  const updateFn = useServerFn(adminUpdatePlan);
  const expireFn = useServerFn(adminExpireDue);

  const { data, isLoading } = useQuery({ queryKey: ["admin-audit"], queryFn: () => auditFn() });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => plansFn() });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!plans.data) return;
    setDrafts(
      Object.fromEntries(
        plans.data.map((p) => [
          p.code,
          {
            priceCents: String(p.priceCents),
            invoiceLimit: String(p.invoiceLimit),
            processingLimit: String(p.processingLimit),
          },
        ]),
      ),
    );
  }, [plans.data]);

  const save = useMutation({
    mutationFn: (code: string) => {
      const d = drafts[code]!;
      return updateFn({
        data: {
          code,
          priceCents: Number(d.priceCents),
          invoiceLimit: Number(d.invoiceLimit),
          processingLimit: Number(d.processingLimit),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم تحديث الخطة");
      void qc.invalidateQueries({ queryKey: ["admin-plans"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expire = useMutation({
    mutationFn: () => expireFn(),
    onSuccess: (r) => toast.success(`تم فحص الاشتراكات — ${r.expired} انتهت`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black">Settings</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">خطط الاشتراك وحدودها</h2>
          <button
            onClick={() => expire.mutate()}
            disabled={expire.isPending}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-bold disabled:opacity-60"
          >
            فحص الاشتراكات المنتهية
          </button>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          الحدود تُقرأ من قاعدة البيانات ويُفرضها الخادم — الزائر بدون حساب: فاتورتان.
        </p>

        {plans.isLoading && <p className="mt-3 text-[12px] text-muted-foreground">جارٍ التحميل…</p>}

        <div className="mt-3 space-y-3">
          {(plans.data ?? []).map((p) => {
            const d = drafts[p.code];
            if (!d) return null;
            return (
              <div key={p.code} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-black uppercase">{p.name}</div>
                  <span className="text-[11px] text-muted-foreground">
                    {p.currency} / {p.interval}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <label className="text-[11px]">
                    <span className="text-muted-foreground">السعر (سنت)</span>
                    <input
                      type="number"
                      min={0}
                      value={d.priceCents}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [p.code]: { ...d, priceCents: e.target.value } })
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-[11px]">
                    <span className="text-muted-foreground">حد الفواتير/شهر</span>
                    <input
                      type="number"
                      min={0}
                      value={d.invoiceLimit}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [p.code]: { ...d, invoiceLimit: e.target.value } })
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-[11px]">
                    <span className="text-muted-foreground">حد المعالجة</span>
                    <input
                      type="number"
                      min={0}
                      value={d.processingLimit}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [p.code]: { ...d, processingLimit: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      onClick={() => save.mutate(p.code)}
                      disabled={save.isPending}
                      className="w-full rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-background disabled:opacity-60"
                    >
                      حفظ
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">سجل تدقيق الإجراءات الإدارية</h2>
        {isLoading && <p className="mt-2 text-[12px] text-muted-foreground">جارٍ التحميل…</p>}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">لا توجد إجراءات مسجّلة</p>
        )}
        {(data?.length ?? 0) > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-right text-[12px]">
              <thead className="bg-muted/60 text-[11px] text-muted-foreground">
                <tr>
                  <th className="p-2">الإجراء</th>
                  <th className="p-2">المدير</th>
                  <th className="p-2">المستخدم المستهدف</th>
                  <th className="p-2">الخطة</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">المدة</th>
                  <th className="p-2">السبب</th>
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
                    <td className="p-2">
                      {r.oldPlan || r.newPlan ? `${r.oldPlan ?? "—"} → ${r.newPlan ?? "—"}` : "—"}
                    </td>
                    <td className="p-2">
                      {r.oldStatus || r.newStatus
                        ? `${r.oldStatus ?? "—"} → ${r.newStatus ?? "—"}`
                        : "—"}
                    </td>
                    <td className="p-2">{r.durationDays ? `${r.durationDays} يوم` : "—"}</td>
                    <td className="p-2">{r.reason ?? "—"}</td>
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
