import type { EvaluationSummary } from "@/application/view-models";
import { evaluationEvidence, evaluationOutcome, evaluationRecommendedAction, evaluationTitle, reportOutcomeClass } from "@/application/report-presentation";

export function ReportEvaluationCard({ evaluation }: { evaluation: EvaluationSummary }) {
  const evidence = evaluationEvidence(evaluation);
  const recommendedAction = evaluationRecommendedAction(evaluation);
  return <section className="report-section border-y border-[#c5cbc6] bg-white p-5">
    <h2 className="font-semibold text-[#18201e]">{evaluationTitle(evaluation)}</h2>
    <p className={`mt-1 ${reportOutcomeClass(evaluation.status)}`}>{evaluationOutcome(evaluation)}</p>
    {evidence.length > 0 ? <ul className="mt-3 space-y-1 text-sm text-[#3e4845]">{evidence.map((line, index) => <li key={index}>{line}</li>)}</ul> : null}
    {evaluation.notEvaluableReasons.length > 0 ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[#8a5417]">{evaluation.notEvaluableReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : null}
    {recommendedAction ? <p className="mt-3 text-sm text-[#3e4845]">{recommendedAction}</p> : null}
  </section>;
}
