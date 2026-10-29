import { Check } from "lucide-react";

const steps = ["อัปโหลด", "จับคู่คอลัมน์", "ตรวจสอบ", "สรุปผล"];

export function ImportWorkflow({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-7 grid border-y border-[var(--hg-rule-strong)] sm:grid-cols-4" aria-label="ขั้นตอนนำเข้าข้อมูล">
      {steps.map((step, index) => {
        const number = index + 1;
        const complete = number < currentStep;
        const active = number === currentStep;
        return (
          <li
            key={step}
            className={`flex items-center gap-3 border-b border-[var(--hg-rule)] px-3 py-3 text-sm last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
              active
                ? "bg-[var(--hg-petrol-soft)] font-semibold text-[var(--hg-petrol-deep)]"
                : complete
                  ? "bg-[var(--hg-surface)] text-[var(--hg-ink-soft)]"
                  : "bg-transparent text-[var(--hg-muted)]"
            }`}
          >
            <span className={`hg-mono flex size-6 shrink-0 items-center justify-center border text-[10px] font-bold ${
              active ? "border-[var(--hg-petrol)] bg-[var(--hg-petrol)] text-white" : complete ? "border-[var(--hg-petrol)] text-[var(--hg-petrol)]" : "border-[var(--hg-rule-strong)] text-[var(--hg-muted)]"
            }`}>
              {complete ? <Check aria-hidden="true" size={14} /> : number}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}

export function ImportBatchBadge({
  status,
}: {
  status: "UPLOADED" | "VALIDATING" | "READY" | "IMPORTING" | "COMPLETED" | "FAILED" | "ROLLED_BACK";
}) {
  const configuration = {
    UPLOADED: ["Uploaded", "bg-[var(--hg-info)]"],
    VALIDATING: ["Needs correction", "bg-[var(--hg-critical)]"],
    READY: ["Ready", "bg-[var(--hg-petrol)]"],
    IMPORTING: ["Importing", "bg-[var(--hg-review)]"],
    COMPLETED: ["Completed", "bg-[var(--hg-petrol)]"],
    FAILED: ["Failed", "bg-[var(--hg-critical)]"],
    ROLLED_BACK: ["Rolled back", "bg-[var(--hg-muted)]"],
  }[status];
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]">
      <span className={`size-1.5 ${configuration[1]}`} />{configuration[0]}
    </span>
  );
}
