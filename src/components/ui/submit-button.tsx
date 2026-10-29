"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingLabel = "กำลังดำเนินการ…",
  className,
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      aria-busy={pending}
      data-pending={pending ? "true" : "false"}
      disabled={disabled || pending}
      className={`hg-interactive hg-pressable ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
