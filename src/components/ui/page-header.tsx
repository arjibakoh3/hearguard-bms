import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 border-b border-[#bcc4bf] pb-5 sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="hg-technical-label mb-2">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.025em] text-[#18201e] sm:text-[1.9rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#68716e] sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="mt-4 shrink-0 sm:mt-0">{actions}</div> : null}
    </header>
  );
}
