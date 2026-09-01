import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, field, primaryBtn } from "@/components/auth-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "إنشاء حساب — دفتر" },
      {
        name: "description",
        content: "أنشئ حسابك في دفتر وابدأ رفع فواتير مشترياتك وقراءتها بالذكاء الاصطناعي.",
      },
      { property: "og:title", content: "إنشاء حساب — دفتر" },
      {
        property: "og:description",
        content: "حساب مجاني لقراءة الفواتير واستخراج الموردين والضرائب والتقارير.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("toast.pwShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("toast.pwMismatch"));
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? t("toast.emailTaken")
          : error.message,
      );
      return;
    }
    if (data.session) {
      toast.success(t("toast.accountCreated"));
      void navigate({ to: "/dashboard" });
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title={t("auth.confirm.title")} subtitle={t("auth.confirm.subtitle")}>
        <p className="text-[13px] leading-relaxed">
          {t("auth.confirm.body.1")}{" "}
          <span dir="ltr" className="font-bold">
            {email}
          </span>{" "}
          {t("auth.confirm.body.2")}
        </p>
        <Link to="/login" className="mt-4 inline-block font-bold text-brand">
          {t("auth.goLogin")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.signup.title")} subtitle={t("auth.signup.subtitle")}>
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
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            {t("auth.confirmPassword")}
          </label>
          <input
            type="password"
            required
            dir="ltr"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={field}
          />
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? t("auth.creating") : t("auth.signup.title")}
        </button>
      </form>

      <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
        {t("auth.hasAccount")}{" "}
        <Link to="/login" className="font-bold text-brand">
          {t("nav.login")}
        </Link>
      </div>
    </AuthShell>
  );
}
