import { STATUS_LABELS } from "@/lib/config";
import { getStatusMeta } from "@/lib/workflow";

export function StatusBadge({ status, className = "" }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-white/70 ${meta.tone.badge} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full shadow-sm ${meta.tone.accent}`} />
      {STATUS_LABELS[meta.status] || meta.label}
    </span>
  );
}

export function ToneBadge({ children, tone = "slate" }) {
  const classes =
    tone === "brand"
      ? "border-brand-200 bg-brand-50 text-brand-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : tone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-white/70 ${classes}`}>{children}</span>;
}
