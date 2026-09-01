import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  deleteUser,
  getUserDetail,
  resetUserPassword,
  setUserRole,
  setUserStatus,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/users_/$userId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تفاصيل المستخدم — إدارة دفتر" },
      { name: "description", content: "عرض نشاط المستخدم واستخدامه وإدارة حسابه في دفتر." },
      { property: "og:title", content: "تفاصيل المستخدم — إدارة دفتر" },
      { property: "og:description", content: "سجل النشاط والإحصائيات وإجراءات الحساب." },
    ],
  }),
  component: UserDetail,
});

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG") : "—");

function UserDetail() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const detail = useServerFn(getUserDetail);
  const status = useServerFn(setUserStatus);
  const role = useServerFn(setUserRole);
  const resetPw = useServerFn(resetUserPassword);
  const remove = useServerFn(deleteUser);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => detail({ data: { userId } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-user", userId] });
    void qc.invalidateQueries({ queryKey: ["admin-users"] });
    void qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const toggle = useMutation({
    mutationFn: (disabled: boolean) => status({ data: { userId, disabled } }),
    onSuccess: () => {
      toast.success("تم تحديث حالة الحساب");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: (r: "user" | "admin") => role({ data: { userId, role: r } }),
    onSuccess: () => {
      toast.success("تم تحديث الصلاحية");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReset = useMutation({
    mutationFn: () =>
      resetPw({ data: { userId, redirectTo: `${window.location.origin}/reset-password` } }),
    onSuccess: () => toast.success("تم إرسال رابط إعادة التعيين"),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => remove({ data: { userId } }),
    onSuccess: () => {
      toast.success("تم حذف المستخدم");
      void navigate({ to: "/admin/users" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (error || !data) return <div className="text-sm text-destructive">تعذّر تحميل المستخدم</div>;

  const u = data.user;

  return (
    <div className="space-y-5">
      <Link to="/admin/users" className="text-xs text-muted-foreground hover:underline">
        ← العودة إلى المستخدمين
      </Link>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">{u.name ?? "—"}</h1>
            <p className="text-sm text-muted-foreground" dir="ltr">
              {u.email ?? "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
              {u.id}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded bg-muted px-2 py-1 text-[11px] font-bold">{u.plan}</span>
            <span className="rounded bg-muted px-2 py-1 text-[11px] font-bold">{u.role}</span>
            <span
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                u.status === "active"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {u.status}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">تاريخ التسجيل</dt>
            <dd className="font-bold">{fmt(u.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">آخر دخول</dt>
            <dd className="font-bold">{fmt(u.lastLoginAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">آخر نشاط</dt>
            <dd className="font-bold">{fmt(u.lastActivity)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">طلبات المعالجة</dt>
            <dd className="font-bold tabular-nums">{u.processingRequests}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["عمليات المعالجة", u.processingOperations],
          ["الفواتير المعالجة", u.invoicesProcessed],
          ["الرفعات المؤقتة", u.tempUploads],
          ["ملفات Excel", u.excelExports],
          ["ملفات PDF", u.pdfExports],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="text-xl font-black tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">إجراءات الحساب</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => toggle.mutate(u.status === "active")}
            disabled={toggle.isPending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-60"
          >
            {u.status === "active" ? "Disable Account" : "Enable Account"}
          </button>
          <button
            onClick={() => changeRole.mutate(u.role === "admin" ? "user" : "admin")}
            disabled={changeRole.isPending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-60"
          >
            {u.role === "admin" ? "Remove Admin" : "Make Admin"}
          </button>
          <button
            onClick={() => sendReset.mutate()}
            disabled={sendReset.isPending}
            className="rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-60"
          >
            Reset Password
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-white"
          >
            Delete User
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">سجل النشاط</h2>
        {data.activity.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground">لا يوجد نشاط بعد</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-[12px]">
            {data.activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <span className="font-semibold">{a.action}</span>
                <span className="text-muted-foreground">{a.detail ?? ""}</span>
                <span className="shrink-0 text-muted-foreground">{fmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5">
            <h3 className="text-base font-black text-destructive">حذف المستخدم نهائيًا؟</h3>
            <p className="mt-2 text-[12px] text-muted-foreground">
              سيُحذف الحساب مع كل فواتيره وسجلاته. لا يمكن التراجع.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={() => del.mutate()}
                disabled={del.isPending}
                className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {del.isPending ? "…" : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
