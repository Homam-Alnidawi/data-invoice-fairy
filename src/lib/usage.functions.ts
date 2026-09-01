import { createServerFn } from "@tanstack/react-start";

export type UsageState = {
  kind: "guest" | "free" | "pro";
  used: number;
  limit: number;
  plan: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

/** حالة الخطة والاستخدام الحالية — تُحسب على الخادم من جلسة المستخدم أو من بصمة الزائر. */
export const getUsageState = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsageState> => {
    const { readPlanState } = await import("./usage.server");
    return readPlanState();
  },
);
