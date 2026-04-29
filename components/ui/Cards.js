export function SectionCard({ title, description, children, action, className = "" }) {
  return (
    <section className={`border border-slate-200/80 bg-white/95 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.08)] ring-1 ring-white/70 sm:p-4 lg:p-6 ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-start lg:justify-between lg:pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950 sm:text-lg lg:text-xl">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="w-full shrink-0 lg:w-auto">{action}</div> : null}
      </div>
      <div className="mt-4 lg:mt-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "slate", className = "" }) {
  const toneClasses =
    tone === "brand"
      ? "border-brand-200 bg-gradient-to-br from-white via-brand-50 to-orange-50 ring-brand-100/80"
      : tone === "success"
        ? "border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-emerald-100/50 ring-emerald-100/80"
        : tone === "warning"
          ? "border-amber-200 bg-gradient-to-br from-white via-amber-50 to-amber-100/50 ring-amber-100/80"
          : "border-slate-200 bg-white ring-slate-100";

  return (
    <div className={`border p-3 shadow-sm ring-1 sm:p-4 ${toneClasses} ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold leading-none text-slate-950">{value}</div>
      {hint ? <div className="mt-2 text-sm leading-5 text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function SoftCard({ children, className = "" }) {
  return <div className={`border border-slate-200/90 bg-slate-50/80 p-3 shadow-sm ring-1 ring-white/70 sm:p-4 ${className}`}>{children}</div>;
}
