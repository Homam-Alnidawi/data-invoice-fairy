import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AuthShell, field, primaryBtn } from "@/components/auth-shell";
import { trackActivity } from "@/lib/activity.functions";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — دفتر" },
      { name: "description", content: "سجّل الدخول إلى حسابك في دفتر لإدارة فواتير مشترياتك وتقاريرك." },
      { property: "og:title", content: "تسجيل الدخول — دفتر" },
      { property: "og:description", content: "ادخل إلى لوحة تحكم دفتر لقراءة الفواتير وتصدير التقارير." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const trackActivityFn = useServerFn(trackActivity);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      const banned = /banned|disabled/i.test(error.message);
      toast.error(
        banned
          ? t("toast.accountDisabled")
          : error.message.includes("Invalid login")
            ? t("toast.badCredentials")
            : error.message,
      );
      return;
    }
    void trackActivityFn({ data: { action: "login" } }).catch(() => undefined);
    toast.success(t("toast.loggedIn"));
    void navigate({ to: "/dashboard" });
  };

  const forgot = async () => {
    if (!email) {
      toast.error(t("toast.emailFirst"));
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success(t("toast.resetSent"));
  };

  return (
    <AuthShell title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            {t("auth.email")}
          </label>
          <input
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            {t("auth.password")}
          </label>
          <input
            type="password"
            required
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t("auth.loggingIn") : t("auth.login.title")}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void forgot()}
        className="mt-3 text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
      >
        {t("auth.forgot")}
      </button>

      <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link to="/signup" className="font-bold text-brand">
          {t("nav.signup")}
        </Link>
      </div>
    </AuthShell>
  );
}
