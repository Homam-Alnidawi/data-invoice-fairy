import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const field =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-brand";

export const primaryBtn =
  "w-full rounded-xl bg-brand px-4 py-2.5 text-[14px] font-extrabold text-primary-foreground disabled:opacity-60";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand text-base leading-none font-extrabold text-primary-foreground">
              دف
            </div>
            <div className="leading-none">
              <div className="text-[15px] font-extrabold tracking-tight">دفتر</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                فواتير المشتريات الذكية
              </div>
            </div>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10">
        <div className="animate-rise rounded-2xl bg-surface p-5 ring-1 ring-black/5">
          <h1 className="text-[22px] font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 mb-4 text-[12px] text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
