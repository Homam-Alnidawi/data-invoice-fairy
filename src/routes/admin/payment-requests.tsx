import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminListPaymentRequests,
  adminReviewPaymentRequest,
  type PaymentRequest,
} from "@/lib/payment-requests.functions";

export const Route = createFileRoute("/admin/payment-requests")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Payment Requests — إدارة دفتر" },
      { name: "description", content: "مراجعة واعتماد طلبات الدفع اليدوي بأمان." },
      { property: "og:title", content: "Payment Requests — إدارة دفتر" },
      { property: "og:description", content: "راجع إثباتات الدفع اليدوي وفعّل الاشتراكات بعد التحقق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentRequestsPage,
});

const statusLabel: Record<PaymentRequest["status"], string> = {
  pending: "قيد المراجعة",
  approved: "تم الاعتماد",
  rejected: "مرفوض",
};

function PaymentRequestsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPaymentRequests);
  const reviewFn = useServerFn(adminReviewPaymentRequest);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-payment-requests"],
    queryFn: () => listFn(),
    retry: false,
  });

  const review = useMutation({
    mutationFn: (input: { requestId: string; decision: "approve" | "reject"; rejectionReason?: string }) =>
      reviewFn({ data: input }),
    onSuccess: (_, variables) => {
      toast.success(variables.decision === "approve" ? "تم اعتماد الطلب وتفعيل الاشتراك" : "تم رفض الطلب");
      setRejecting(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-payment-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black">Payment Requests</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          تحقق من المبلغ ورقم العملية وإثبات الدفع قبل اعتماد دورة اشتراك واحدة.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {error && <p className="text-sm text-destructive">تعذّر تحميل طلبات الدفع.</p>}
      {!isLoading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا توجد طلبات دفع حتى الآن.
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((request) => (
          <article key={request.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black">{request.planName}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      request.status === "pending"
                        ? "bg-amber-500/15 text-amber-700"
                        : request.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {statusLabel[request.status]}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground" dir="ltr">
                  {request.userEmail ?? request.userId}
                </p>
              </div>
              <div className="text-left" dir="ltr">
                <div className="text-lg font-black tabular-nums">
                  {request.amount.toLocaleString("en-US")} {request.currency}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(request.submittedAt).toLocaleString("en-GB")}
                </div>
              </div>
            </div>

            <dl className="mt-4 grid gap-2 text-[12px] sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">طريقة الدفع</dt>
                <dd className="mt-0.5 font-bold" dir="ltr">{request.paymentMethod}</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">رقم العملية</dt>
                <dd className="mt-0.5 break-all font-bold" dir="ltr">{request.transactionId ?? "—"}</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">معرّف الطلب</dt>
                <dd className="mt-0.5 break-all font-mono text-[10px]" dir="ltr">{request.id}</dd>
              </div>
            </dl>

            {request.paymentProofUrl && (
              <a
                href={request.paymentProofUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-bold hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                فتح إثبات الدفع
              </a>
            )}

            {request.status === "rejected" && request.rejectionReason && (
              <p className="mt-3 rounded-lg bg-destructive/10 p-2 text-[12px] text-destructive">
                سبب الرفض: {request.rejectionReason}
              </p>
            )}

            {request.status === "pending" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ requestId: request.id, decision: "approve" })}
                >
                  <Check /> اعتماد وتفعيل دورة
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={review.isPending}
                  onClick={() => {
                    setRejecting(rejecting === request.id ? null : request.id);
                    setReason("");
                  }}
                >
                  <X /> رفض
                </Button>
              </div>
            )}

            {rejecting === request.id && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="سبب الرفض (اختياري)"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ requestId: request.id, decision: "reject", rejectionReason: reason })}
                >
                  تأكيد الرفض
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
