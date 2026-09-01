import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/admin.functions";
import { BarChart3, CreditCard, Home, LayoutDashboard, LogOut, Menu, Settings, Users } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/users", label: "Users", icon: Users, exact: false },
  { to: "/admin/statistics", label: "Statistics", icon: BarChart3, exact: false },
  { to: "/admin/settings", label: "Settings", icon: Settings, exact: false },
  { to: "/admin/payments", label: "Payment Providers", icon: CreditCard, exact: false },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const check = useServerFn(amIAdmin);
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        void navigate({ to: "/login" });
        return;
      }
      const ok = await check().catch(() => false);
      if (!alive) return;
      setState(ok ? "ok" : "denied");
    })();
    return () => {
      alive = false;
    };
  }, [check, navigate]);

  useEffect(() => setOpen(false), [path]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("تم تسجيل الخروج");
    void navigate({ to: "/login", replace: true });
  };

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        جارٍ التحقق من الصلاحيات…
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-black">غير مصرّح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            هذه الصفحة مخصّصة لمديري النظام فقط.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background"
          >
            العودة إلى لوحتي
          </Link>
        </div>
      </div>
    );
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="px-2 pb-4 pt-1">
        <div className="text-sm font-black">دفتر — Admin</div>
        <div className="text-[11px] text-muted-foreground">لوحة إدارة النظام</div>
      </div>
      <Link
        to="/"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
      >
        <Home className="size-4" />
        الصفحة الرئيسية
      </Link>
      <div className="my-2 border-t border-border" />
      {NAV.map((n) => {
        const active = n.exact ? path === n.to : path.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            <n.icon className="size-4" />
            {n.label}
          </Link>
        );
      })}
      <button
        onClick={() => void signOut()}
      <button
        onClick={() => void signOut()}
        className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
      >
        <LogOut className="size-4" />
        Logout
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <span className="text-sm font-black">دفتر — Admin</span>
        <button onClick={() => setOpen((v) => !v)} aria-label="القائمة">
          <Menu className="size-5" />
        </button>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-l border-border md:block">
          {sidebar}
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 w-64 border-l border-border bg-card">
              {sidebar}
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
