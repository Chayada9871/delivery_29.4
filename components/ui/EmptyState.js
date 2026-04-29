export function EmptyState({ text }) {
  return (
    <div className="border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white px-5 py-10 text-center text-sm text-slate-500 shadow-inner">
      <div className="mx-auto mb-3 h-1.5 w-16 bg-slate-300" />
      <div className="mx-auto max-w-md leading-6">{text}</div>
    </div>
  );
}
