import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AuthShell, field, primaryBtn } from "@/components/auth-shell";
import { trackActivity } from "@/lib/activity.functions";

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
          ? "تم تعطيل هذا الحساب. تواصل مع الدعم."
          : error.message.includes("Invalid login")
            ? "البريد الإلكتروني أو كلمة المرور غير صحيحة"
            : error.message,
      );
      return;
    }
    void trackActivityFn({ data: { action: "login" } }).catch(() => undefined);
    toast.success("تم تسجيل الدخول");
    void navigate({ to: "/dashboard" });
  };

  const forgot = async () => {
    if (!email) {
      toast.error("اكتب بريدك الإلكتروني أولًا");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك");
  };

  return (
    <AuthShell title="تسجيل الدخول" subtitle="ادخل إلى سِجِلّ فواتيرك وتقاريرك">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            البريد الإلكتروني
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
            كلمة المرور
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
          {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void forgot()}
        className="mt-3 text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
      >
        نسيت كلمة المرور؟
      </button>

      <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link to="/signup" className="font-bold text-brand">
          إنشاء حساب
        </Link>
      </div>
    </AuthShell>
  );
}
