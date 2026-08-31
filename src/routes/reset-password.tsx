import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, field, primaryBtn } from "@/components/auth-shell";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور — دفتر" },
      { name: "description", content: "اختر كلمة مرور جديدة لحسابك في دفتر." },
      { property: "og:title", content: "إعادة تعيين كلمة المرور — دفتر" },
      { property: "og:description", content: "استعد الوصول إلى حسابك في دفتر." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

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
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم تحديث كلمة المرور");
    void navigate({ to: "/dashboard" });
  };

  return (
    <AuthShell title="كلمة مرور جديدة" subtitle="اكتب كلمة المرور الجديدة لحسابك">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            كلمة المرور الجديدة
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
          {busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
        </button>
      </form>
    </AuthShell>
  );
}
