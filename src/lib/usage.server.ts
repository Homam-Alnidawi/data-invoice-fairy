// Server-only helpers for plan / quota enforcement.
import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

export type PlanState = {
  kind: "guest" | "free" | "pro";
  used: number;
  limit: number;
  plan: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

function publishableClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Reads the caller's identity from the request bearer token (optional auth). */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token || token.split(".").length !== 3) return null;

  const supabase = publishableClient();
  const { data, error } = await supabase.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: String(sub), email: (data.claims["email"] as string | undefined) ?? null };
}

/** Stable, non-forgeable-ish guest key derived from the caller's network address. */
export async function guestFingerprint(): Promise<string> {
  const request = getRequest();
  const h = request?.headers;
  const ip =
    h?.get("cf-connecting-ip") ??
    h?.get("x-real-ip") ??
    h?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const ua = h?.get("user-agent") ?? "";
  const bytes = new TextEncoder().encode(`${ip}|${ua.slice(0, 80)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const GUEST_LIMIT = 2;

/** Reads the current caller's plan + usage without consuming anything. */
export async function readPlanState(): Promise<PlanState> {
  const db = await admin();
  const user = await currentUser();

  if (!user) {
    const fp = await guestFingerprint();
    const { data } = await db
      .from("guest_usage")
      .select("used")
      .eq("fingerprint", fp)
      .maybeSingle();
    return {
      kind: "guest",
      used: data?.used ?? 0,
      limit: GUEST_LIMIT,
      plan: "guest",
      subscriptionStatus: "inactive",
      currentPeriodEnd: null,
    };
  }

  const { data } = await db.rpc("ensure_profile", {
    _user_id: user.id,
    _email: user.email ?? undefined,
  });
  const p = (Array.isArray(data) ? data[0] : data) as
    | {
        plan: string;
        monthly_invoice_usage: number;
        monthly_invoice_limit: number;
        subscription_status: string;
        current_period_end: string | null;
      }
    | null;

  return {
    kind: p?.plan === "pro" ? "pro" : "free",
    used: p?.monthly_invoice_usage ?? 0,
    limit: p?.monthly_invoice_limit ?? 5,
    plan: p?.plan ?? "free",
    subscriptionStatus: p?.subscription_status ?? "inactive",
    currentPeriodEnd: p?.current_period_end ?? null,
  };
}

export type QuotaTicket =
  | { allowed: true; kind: "guest" | "free" | "pro"; used: number; limit: number; refund: () => Promise<void> }
  | { allowed: false; kind: "guest" | "free" | "pro"; used: number; limit: number };

/** Consumes one invoice from the caller's quota, server-side. */
export async function consumeQuota(): Promise<QuotaTicket> {
  const db = await admin();
  const user = await currentUser();

  if (!user) {
    const fp = await guestFingerprint();
    const { data, error } = await db.rpc("consume_guest_quota", {
      _fingerprint: fp,
      _limit: GUEST_LIMIT,
    });
    if (error) throw new Error("تعذّر التحقق من رصيد التجربة");
    const r = data as unknown as { allowed: boolean; used: number; limit: number };
    if (!r.allowed) return { allowed: false, kind: "guest", used: r.used, limit: r.limit };
    return {
      allowed: true,
      kind: "guest",
      used: r.used,
      limit: r.limit,
      refund: async () => {
        await db.rpc("refund_guest_quota", { _fingerprint: fp });
      },
    };
  }

  const { data, error } = await db.rpc("consume_invoice_quota", {
    _user_id: user.id,
    _email: user.email ?? undefined,
  });
  if (error) throw new Error("تعذّر التحقق من رصيد حسابك");
  const r = data as unknown as { allowed: boolean; used: number; limit: number; plan: string };
  const kind = r.plan === "pro" ? "pro" : "free";
  if (!r.allowed) return { allowed: false, kind, used: r.used, limit: r.limit };
  return {
    allowed: true,
    kind,
    used: r.used,
    limit: r.limit,
    refund: async () => {
      await db.rpc("refund_invoice_quota", { _user_id: user.id });
    },
  };
}
