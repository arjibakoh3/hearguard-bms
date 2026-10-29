import { AlertTriangle, FlaskConical, ShieldCheck, Stethoscope } from "lucide-react";
import { getLatestRuleEvaluation } from "@/application/audiogram-presentation";
import type { EmployeeProfile, EvaluationSummary } from "@/application/view-models";
import { EvaluationBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/format";

function earLabel(value: "LEFT" | "RIGHT"): string {
  return value === "RIGHT" ? "หูขวา" : "หูซ้าย";
}

function EvaluationCard({
  evaluation,
  analytical = false,
}: {
  evaluation: EvaluationSummary | null | undefined;
  analytical?: boolean;
}) {
  if (!evaluation) {
    return (
      <div className="border-y border-dashed border-[#bcc4bf] py-5">
        <p className="font-semibold text-slate-800">ยังไม่มีผลประเมิน</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">ไม่พบ evaluation ของกรอบนี้ในข้อมูลปัจจุบัน</p>
      </div>
    );
  }

  return (
    <article className="border-t border-[#bcc4bf] bg-[#fafaf7]/35 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {analytical ? (
              <FlaskConical aria-hidden="true" className="text-violet-600" size={18} />
            ) : (
              <Stethoscope aria-hidden="true" className="text-teal-700" size={18} />
            )}
            <h3 className="font-semibold text-slate-950">{evaluation.ruleName}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">{evaluation.ruleCode} · v{evaluation.ruleVersion}</p>
        </div>
        <EvaluationBadge status={evaluation.status} />
      </div>

      {analytical ? (
        <p className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800">
          Draft analytical comparator — ไม่เปลี่ยนผลไทย baseline หรือ follow-up workflow อัตโนมัติ
        </p>
      ) : null}

      {analytical && evaluation.earAverages.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-violet-100">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-violet-50 text-violet-800"><tr><th className="px-3 py-2.5">หู</th><th className="px-3 py-2.5">ความถี่</th><th className="px-3 py-2.5">Baseline average</th><th className="px-3 py-2.5">Current average</th><th className="px-3 py-2.5">Change</th><th className="px-3 py-2.5">ผล</th></tr></thead>
            <tbody className="divide-y divide-violet-100">
              {evaluation.earAverages.map((average) => (
                <tr key={average.ear}>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{earLabel(average.ear)}</td>
                  <td className="px-3 py-2.5 text-slate-600">{average.frequenciesHz.join("/")} Hz</td>
                  <td className="px-3 py-2.5 text-slate-700">{average.baselineDbHl} dB HL</td>
                  <td className="px-3 py-2.5 text-slate-700">{average.currentDbHl} dB HL</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{average.differenceDb >= 0 ? "+" : ""}{average.differenceDb} dB</td>
                  <td className={`px-3 py-2.5 font-semibold ${average.differenceDb >= 10 ? "text-amber-700" : "text-emerald-700"}`}>{average.differenceDb >= 10 ? "เข้าเกณฑ์ comparator" : "ไม่เข้าเกณฑ์"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {evaluation.findings.length > 0 ? (
        <div className="mt-4 space-y-3">
          {evaluation.findings.map((finding, index) => (
            <dl key={`${finding.ear}-${finding.frequenciesHz.join("-")}-${index}`} className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-amber-50 p-3 text-sm">
              <div>
                <dt className="text-xs text-amber-700">ตำแหน่งที่พบ</dt>
                <dd className="mt-1 font-semibold text-amber-950">{earLabel(finding.ear)} · {finding.frequenciesHz.join("/")} Hz</dd>
              </div>
              <div>
                <dt className="text-xs text-amber-700">การเปลี่ยนแปลง</dt>
                <dd className="mt-1 font-semibold text-amber-950">{finding.differenceDb >= 0 ? "+" : ""}{finding.differenceDb} dB</dd>
              </div>
              <div>
                <dt className="text-xs text-amber-700">Baseline</dt>
                <dd className="mt-1 font-medium text-amber-950">{finding.baselineDbHl} dB HL</dd>
              </div>
              <div>
                <dt className="text-xs text-amber-700">Current</dt>
                <dd className="mt-1 font-medium text-amber-950">{finding.currentDbHl} dB HL</dd>
              </div>
            </dl>
          ))}
        </div>
      ) : evaluation.status === "not_evaluable" ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {evaluation.notEvaluableReasons.join(" · ") || "ข้อมูลไม่เพียงพอต่อการประเมิน"}
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          ไม่พบจุดที่เข้าเกณฑ์ของ rule นี้
        </div>
      )}

      {evaluation.recommendedAction ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended next step</p>
          <p className="mt-1.5 text-sm leading-6 text-slate-700">{evaluation.recommendedAction}</p>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-slate-400">ประเมินเมื่อ {formatDate(evaluation.evaluatedAt)}</p>
    </article>
  );
}

function NioshCard({ analysis }: { analysis: EmployeeProfile["nioshAnalysis"] }) {
  if (!analysis) return null;

  const statusLabel = {
    NO_SHIFT_DETECTED: "No qualifying shift",
    INSUFFICIENT_DATA: "Insufficient confirmation data",
    NIOSH_SHIFT_NOT_CONFIRMED: "Shift not confirmed",
    NIOSH_PERSISTENT_SHIFT_CONFIRMED: "Persistent shift confirmed",
  }[analysis.status];
  const attention = ["INSUFFICIENT_DATA", "NIOSH_PERSISTENT_SHIFT_CONFIRMED"].includes(analysis.status);

  return (
    <article className="border-y border-[#9fb9c6] bg-[#eef3f4]/55 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <FlaskConical aria-hidden="true" className="mt-0.5 text-sky-700" size={19} />
          <div>
            <h3 className="font-semibold text-slate-950">NIOSH persistence analysis</h3>
            <p className="mt-1 text-xs text-sky-800">Longitudinal analytical suggestion · ไม่ใช่ operational rule</p>
          </div>
        </div>
        <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${attention ? "text-[#8a5715]" : "text-[#1d6c67]"}`}>
          {statusLabel}
        </span>
      </div>

      {analysis.findings.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="text-sky-800">
              <tr>
                <th className="pb-2">จุดที่ติดตาม</th>
                <th className="pb-2">Baseline</th>
                <th className="pb-2">Monitoring</th>
                <th className="pb-2">Immediate retest (legacy)</th>
                <th className="pb-2">Confirmation</th>
                <th className="pb-2">ผล</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100 text-slate-700">
              {analysis.findings.map((finding) => (
                <tr key={`${finding.ear}-${finding.frequencyHz}`}>
                  <td className="py-2.5 font-semibold">{earLabel(finding.ear)} · {finding.frequencyHz} Hz</td>
                  <td className="py-2.5">{finding.baselineDbHl} dB</td>
                  <td className="py-2.5">{finding.monitoringDbHl} dB ({finding.monitoringDifferenceDb >= 0 ? "+" : ""}{finding.monitoringDifferenceDb})</td>
                  <td className="py-2.5">{finding.immediateRetestDbHl === null ? "—" : `${finding.immediateRetestDbHl} dB`}</td>
                  <td className="py-2.5">{finding.confirmationDbHl === null ? "—" : `${finding.confirmationDbHl} dB`}</td>
                  <td className="py-2.5 font-semibold">{finding.confirmationPersistent === true ? "ยืนยันต่อเนื่อง" : finding.immediateRetestPersistent === false || finding.confirmationPersistent === false ? "ไม่ยืนยัน" : "ข้อมูลยังไม่ครบ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {analysis.reasons.length > 0 ? (
        <div className="mt-4 flex items-start gap-2 text-sm leading-6 text-sky-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
          <p>{analysis.reasons.join(" · ")}</p>
        </div>
      ) : null}
      {analysis.interpretationFlags.includes("POSSIBLE_MEASUREMENT_VARIABILITY") ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">POSSIBLE_MEASUREMENT_VARIABILITY — อาจเป็น temporary threshold change หรือความแปรปรวนของการวัด ต้องให้ผู้ประกอบวิชาชีพทบทวน</p>
      ) : null}
      <p className="mt-4 border-t border-sky-200 pt-3 text-xs leading-5 text-sky-900">
        Automatic baseline change: <strong>NO</strong> · Thai follow-up mutation: <strong>NO</strong> · ต้องทบทวนโดยผู้ประกอบวิชาชีพที่รับผิดชอบ
      </p>
    </article>
  );
}

export function SurveillanceExplanation({ profile }: { profile: EmployeeProfile }) {
  const thai = getLatestRuleEvaluation(profile.audiograms, profile.evaluations, "THAI_HEARING_2561");
  const osha = getLatestRuleEvaluation(profile.audiograms, profile.evaluations, "OSHA_STS_29_CFR_1910_95");

  return (
    <section className="border-t border-[#bcc4bf] pt-5">
      <div className="mb-4">
        <p className="hg-technical-label">03 · Evaluation frameworks</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Surveillance explanation</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">แสดงชื่อกฎ รุ่น จุดที่เข้าเกณฑ์ และขั้นตอนถัดไป โดยไม่รวมเป็นสถานะ STS ที่กำกวม</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <EvaluationCard evaluation={thai} />
        <EvaluationCard evaluation={osha} analytical />
      </div>
      <div className="mt-4">
        <NioshCard analysis={profile.nioshAnalysis} />
      </div>
    </section>
  );
}
