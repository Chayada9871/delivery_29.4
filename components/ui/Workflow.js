import { WORKFLOW_STEPS, getWorkflowIndex, getStatusMeta } from "@/lib/workflow";

export function WorkflowSteps({ status, steps = WORKFLOW_STEPS }) {
  const currentIndex = getWorkflowIndex(status);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-6 lg:overflow-visible lg:pb-0">
      {steps.map((step, index) => {
        const active = currentIndex === index;
        const done = currentIndex > index;
        const meta = getStatusMeta(step.status);

        return (
          <div
            key={step.status}
            className={`min-w-[180px] border p-3 lg:min-w-0 lg:p-4 ${
              active
                ? `${meta.tone.badge} shadow-sm`
                : done
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">{step.symbol}</div>
            <div className="mt-2 text-sm font-semibold">{step.title}</div>
            <div className="mt-1 text-xs leading-5">{step.description}</div>
          </div>
        );
      })}
    </div>
  );
}
