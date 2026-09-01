import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";
import {
  getMySubscription,
  cancelMySubscription,
  reactivateMySubscription,
  type MySubscription,
} from "@/lib/subscriptions.functions";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "الاشتراك والفوترة — دفتر" },
      {
        name: "description",
        content:
          "اعرض باقتك الحالية وحالة اشتراكك وعدد الفواتير المستخدمة والمتبقية، وأدر التجديد أو الترقية.",
      },
      { property: "og:title", content: "الاشتراك والفوترة — دفتر" },
      {
        property: "og:description",
        content: "إدارة باقتك: الاستهلاك الشهري، تاريخ التجديد، الإلغاء وإعادة التفعيل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage;
});

function SettingsPage() {
  return null;
}
