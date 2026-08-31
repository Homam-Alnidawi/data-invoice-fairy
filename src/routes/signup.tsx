import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, field, primaryBtn } from "@/components/auth-shell";

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
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
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
          ? "هذا البريد مسجّل مسبقًا — سجّل الدخول"
          : error.message,
      );
      return;
    }
    if (data.session) {
      toast.success("تم إنشاء الحساب");
      void navigate({ to: "/dashboard" });
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="تأكيد البريد الإلكتروني" subtitle="بقيت خطوة واحدة">
        <p className="text-[13px] leading-relaxed">
          أرسلنا رسالة تأكيد إلى <span dir="ltr" className="font-bold">{email}</span>. افتح الرابط
          داخلها لتفعيل حسابك، ثم سجّل الدخول.
        </p>
        <Link to="/login" className="mt-4 inline-block font-bold text-brand">
          الذهاب إلى تسجيل الدخول
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="إنشاء حساب" subtitle="ابدأ بقراءة فواتيرك خلال دقيقة">
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
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            تأكيد كلمة المرور
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
          {busy ? "جارٍ الإنشاء…" : "إنشاء حساب"}
        </button>
      </form>

      <div className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
        لديك حساب بالفعل؟{" "}
        <Link to="/login" className="font-bold text-brand">
          تسجيل الدخول
        </Link>
      </div>
    </AuthShell>
  );
}
