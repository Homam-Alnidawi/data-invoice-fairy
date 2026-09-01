import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createUser, listUsers, type AdminUserRow } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "المستخدمون — إدارة دفتر" },
      { name: "description", content: "إدارة حسابات المستخدمين وصلاحياتهم واستخدامهم في دفتر." },
      { property: "og:title", content: "المستخدمون — إدارة دفتر" },
      { property: "og:description", content: "بحث وتصفية وإدارة كاملة لحسابات المستخدمين." },
    ],
  }),
  component: UsersPage,
});

const PAGE = 10;
type SortKey = "createdAt" | "lastActivity" | "invoicesProcessed" | "email";

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG") : "—");

function UsersPage() {
  const qc = useQueryClient();
  const load = useServerFn(listUsers);
  const add = useServerFn(createUser);

  const { data, isLoading, error } = useQuery({ queryKey: ["admin-users"], queryFn: () => load() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [page, setPage] = useState(0);
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "user" as "user" | "admin" });

  const create = useMutation({
    mutationFn: () => add({ data: form }),
    onSuccess: () => {
      toast.success("تم إنشاء المستخدم");
      setOpenAdd(false);
      setForm({ email: "", password: "", name: "", role: "user" });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    let r: AdminUserRow[] = data ?? [];
    const needle = q.trim().toLowerCase();
    if (needle)
      r = r.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(needle) ||
          (u.name ?? "").toLowerCase().includes(needle) ||
          u.id.includes(needle),
      );
    if (status !== "all") r = r.filter((u) => u.status === status);
    return [...r].sort((a, b) => {
      if (sort === "email") return (a.email ?? "").localeCompare(b.email ?? "");
      if (sort === "invoicesProcessed") return b.invoicesProcessed - a.invoicesProcessed;
      const key = sort === "createdAt" ? "createdAt" : "lastActivity";
      return new Date(b[key] ?? 0).getTime() - new Date(a[key] ?? 0).getTime();
    });
  }, [data, q, status, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Users</h1>
        <button
          onClick={() => setOpenAdd(true)}
          className="rounded-lg bg-foreground px-3 py-2 text-sm font-bold text-background"
        >
          + Add User
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="بحث بالاسم أو البريد أو المعرّف…"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="createdAt">الأحدث تسجيلًا</option>
          <option value="lastActivity">آخر نشاط</option>
          <option value="invoicesProcessed">الأكثر معالجة</option>
          <option value="email">البريد (أبجديًا)</option>
        </select>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
      {error && <div className="text-sm text-destructive">تعذّر تحميل المستخدمين</div>}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا يوجد مستخدمون مطابقون
        </div>
      )}

      {view.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[880px] text-right text-[12px]">
            <thead className="bg-muted/60 text-[11px] text-muted-foreground">
              <tr>
                <th className="p-2">الاسم</th>
                <th className="p-2">البريد</th>
                <th className="p-2">الدور</th>
                <th className="p-2">الحالة</th>
                <th className="p-2">التسجيل</th>
                <th className="p-2">آخر دخول</th>
                <th className="p-2">عمليات</th>
                <th className="p-2">فواتير</th>
                <th className="p-2">رفعات</th>
                <th className="p-2">آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {view.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-muted/40">
                  <td className="p-2 font-bold">
                    <Link to="/admin/users/$userId" params={{ userId: u.id }} className="text-brand">
                      {u.name ?? "—"}
                    </Link>
                  </td>
                  <td className="p-2" dir="ltr">
                    {u.email ?? "—"}
                  </td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        u.status === "active"
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="p-2">{fmt(u.createdAt)}</td>
                  <td className="p-2">{fmt(u.lastLoginAt)}</td>
                  <td className="p-2 tabular-nums">{u.processingOperations}</td>
                  <td className="p-2 tabular-nums">{u.invoicesProcessed}</td>
                  <td className="p-2 tabular-nums">{u.tempUploads}</td>
                  <td className="p-2">{fmt(u.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-border px-3 py-1 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-muted-foreground">
            {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-border px-3 py-1 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      {openAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-black">Add User</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <input
                required
                placeholder="الاسم"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                required
                type="email"
                dir="ltr"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                required
                type="password"
                dir="ltr"
                minLength={8}
                placeholder="Password (8+)"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "user" | "admin" })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenAdd(false)}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="flex-1 rounded-lg bg-foreground px-3 py-2 text-sm font-bold text-background disabled:opacity-60"
                >
                  {create.isPending ? "…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
