import type {
  ClinicalResultStatus,
  FollowUpCaseStatus,
  WorkflowDisplayStage,
} from "@/application/view-models";
import { workflowDisplayStageFromStatus } from "@/application/employee-status";

const statusConfiguration: Record<
  WorkflowDisplayStage,
  { label: string; className: string; marker: string }
> = {
  REPEAT_REQUIRED: {
    label: "Repeat required",
    className: "text-[#a83232]",
    marker: "!",
  },
  PHYSICIAN_REVIEW: {
    label: "Awaiting physician review",
    className: "text-[#66517f]",
    marker: "◆",
  },
  INTERVENTION_REQUIRED: {
    label: "Intervention required",
    className: "text-[#9a5a18]",
    marker: "▲",
  },
  FOLLOW_UP: {
    label: "Follow-up",
    className: "text-[#1d6c67]",
    marker: "→",
  },
  CLOSED: {
    label: "Closed",
    className: "text-[#68716e]",
    marker: "✓",
  },
};

function Signal({ label, marker, className, compact = false }: { label: string; marker: string; className: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold ${compact ? "text-[11px]" : "text-xs"} ${className}`}>
      <span aria-hidden="true" className="font-mono text-[0.9em]">{marker}</span>
      {label}
    </span>
  );
}

export function FollowUpWorkflowBadge({
  status,
}: {
  status: FollowUpCaseStatus | null;
}) {
  if (status === null) {
    return <Signal label="No case" marker="○" className="text-[#7b8581]" />;
  }

  const configuration = statusConfiguration[workflowDisplayStageFromStatus(status)];

  return <Signal {...configuration} />;
}

export function WorkflowStageBadge({ status }: { status: WorkflowDisplayStage }) {
  return <Signal {...statusConfiguration[status]} />;
}

export function StatusBadge({ status }: { status: FollowUpCaseStatus }) {
  return <FollowUpWorkflowBadge status={status} />;
}

export function ClinicalResultBadge({
  status,
}: {
  status: ClinicalResultStatus | null;
}) {
  if (status === null) {
    return <Signal compact label="No evaluation" marker="○" className="text-[#7b8581]" />;
  }

  return <EvaluationBadge status={status} />;
}

export function EvaluationBadge({
  status,
}: {
  status: ClinicalResultStatus;
}) {
  const configuration = {
    positive: {
      label: "Shift detected",
      className: "text-[#8a5715]",
      marker: "△",
    },
    negative: {
      label: "Stable",
      className: "text-[#1d6c67]",
      marker: "●",
    },
    not_evaluable: {
      label: "Not evaluable",
      className: "text-[#68716e]",
      marker: "—",
    },
  }[status];

  return <Signal compact {...configuration} />;
}
