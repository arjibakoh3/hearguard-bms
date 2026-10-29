import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="group relative min-w-0 border-l border-[#bcc4bf] py-2 pl-4 first:border-l-0 first:pl-0 sm:py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-[#68716e]">{label}</p>
          <p className="mt-1.5 font-mono text-[1.55rem] font-medium leading-none tracking-[-0.035em] text-[#18201e]" data-measurement>
            {value}
          </p>
          {detail ? (
            <p className="mt-2 max-w-48 text-[11px] leading-[1.45] text-[#68716e]">{detail}</p>
          ) : null}
        </div>
        <span className="mr-3 mt-0.5 text-[#1d6c67] opacity-70">
          <Icon aria-hidden="true" size={16} strokeWidth={1.6} />
        </span>
      </div>
    </div>
  );
}
