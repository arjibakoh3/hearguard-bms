import type {
  AaoHnsReferralAssessment,
  ReferralCriterionResult,
  ReferralStatus,
} from "@/domain/hearing/rules/aao-hns-referral";
import { formatDate } from "@/lib/format";
import { reportOutcomeClass } from "@/application/report-presentation";

const CRITERION_DESCRIPTION: Record<ReferralCriterionResult["code"], string> = {
  "A.1": "ค่าเฉลี่ยระดับการได้ยินของหูข้างใดข้างหนึ่ง",
  "A.2": "ผลต่างค่าเฉลี่ยระหว่างหู (ความถี่ต่ำ)",
  "A.3": "ผลต่างค่าเฉลี่ยระหว่างหู (ความถี่สูง)",
  "B.1": "ค่าเฉลี่ยของหูข้างใดข้างหนึ่งแย่ลงจาก Baseline ครั้งแรก (ความถี่ต่ำ)",
  "B.2": "ค่าเฉลี่ยของหูข้างใดข้างหนึ่งแย่ลงจาก Baseline ครั้งแรก (ความถี่สูง)",
};

export function referralStatusLabel(status: ReferralStatus): string {
  if (status === "MEETS_CRITERIA") return "เข้าเกณฑ์พิจารณาส่งต่อ";
  if (status === "DOES_NOT_MEET") return "ไม่เข้าเกณฑ์เชิงตัวเลข";
  return "ประเมินไม่ได้ครบถ้วน";
}

function db(value: number | null): string {
  return value === null ? "—" : `${Number(value.toFixed(2))} dB HL`;
}

function earLabel(ear: "RIGHT" | "LEFT"): string {
  return ear === "RIGHT" ? "หูขวา" : "หูซ้าย";
}

export function referralCriterionEvidence(criterion: ReferralCriterionResult): string[] {
  if (criterion.code === "A.1") {
    return criterion.earAverages.map((item) => `${earLabel(item.ear)} ${db(item.currentDbHl)}`);
  }
  if (criterion.code === "A.2" || criterion.code === "A.3") {
    return [
      ...criterion.earAverages.map((item) => `${earLabel(item.ear)} ${db(item.currentDbHl)}`),
      `ผลต่างระหว่างหู ${db(criterion.interauralDifferenceDb)}`,
    ];
  }
  return criterion.earAverages.map((item) =>
    `${earLabel(item.ear)} Baseline ${db(item.originalBaselineDbHl)} → ครั้งนี้ ${db(item.currentDbHl)}; แย่ลง ${db(item.changeDb)}`,
  );
}

function triggeredCodes(assessment: AaoHnsReferralAssessment): string {
  return assessment.criteria
    .filter((item) => item.status === "MEETS_CRITERIA")
    .map((item) => item.code)
    .join(", ");
}

function assessmentConclusion(assessment: AaoHnsReferralAssessment, historical = false): string {
  if (assessment.status === "MEETS_CRITERIA") {
    return historical
      ? `Baseline ครั้งแรกเคยเข้าเกณฑ์ AAO-HNS 1983 ข้อ ${triggeredCodes(assessment)} (ข้อมูลย้อนหลัง)`
      : `เข้าเกณฑ์พิจารณาส่งต่อแพทย์หู คอ จมูก ตาม AAO-HNS 1983 ข้อ ${triggeredCodes(assessment)}`;
  }
  if (assessment.status === "DOES_NOT_MEET") {
    return historical
      ? "Baseline ครั้งแรกไม่เข้าเกณฑ์เชิงตัวเลข (ข้อมูลย้อนหลัง)"
      : "ไม่พบข้อที่เข้าเกณฑ์เชิงตัวเลขจากข้อมูลที่ประเมินได้ครบ";
  }
  return historical
    ? "Baseline ครั้งแรกมีข้อมูลไม่พอสำหรับสรุปเกณฑ์เชิงตัวเลข (ข้อมูลย้อนหลัง)"
    : "ข้อมูลไม่พอหรือผลตรวจไม่ valid; ยังสรุปว่าไม่เข้าเกณฑ์ไม่ได้";
}

function CriterionDetails({ criterion }: { criterion: ReferralCriterionResult }) {
  return <div className="hg-referral-criterion border-t border-[#d5dad5] py-2 text-sm">
    <p><strong>ข้อ {criterion.code} · {CRITERION_DESCRIPTION[criterion.code]}</strong> <span className={reportOutcomeClass(criterion.status)}>{referralStatusLabel(criterion.status)}</span></p>
    <p className="text-[#68716e]">{criterion.frequenciesHz.map((value) => value.toLocaleString("en-US")).join("/")} Hz · เกณฑ์มากกว่า {criterion.cutoffDb} dB HL</p>
    {criterion.earAverages.length ? <p>{referralCriterionEvidence(criterion).join(" · ")}</p> : null}
    {criterion.missingReasons.length ? <p className="text-[#8a5417]">ข้อมูลที่ใช้คำนวณไม่ได้: {criterion.missingReasons.join("; ")}</p> : null}
  </div>;
}

function SourceLine({ assessment }: { assessment: AaoHnsReferralAssessment }) {
  return <p className="break-all text-xs text-[#68716e]">
    {assessment.ruleCode} · v{assessment.ruleVersion} · ผลครั้งนี้ {formatDate(assessment.currentExamDate)} ({assessment.currentAudiogramId})
    {assessment.originalBaselineAudiogramId
      ? ` · Baseline ครั้งแรก ${formatDate(assessment.originalBaselineExamDate)} (${assessment.originalBaselineAudiogramId})`
      : " · ไม่พบ Baseline ครั้งแรก"}
  </p>;
}

function AssessmentDetails({ assessment, historical = false }: {
  assessment: AaoHnsReferralAssessment;
  historical?: boolean;
}) {
  return <div className={historical ? "mt-4 border-l-2 border-[#9da7a1] pl-4" : ""}>
    <p className="font-semibold">{historical ? "Section A · Baseline ครั้งแรก (ข้อมูลย้อนหลัง)" : assessment.section ? `Section ${assessment.section} · ผลตรวจที่เลือก` : "ผลตรวจที่เลือก"}</p>
    <p className={`mt-1 text-sm ${reportOutcomeClass(assessment.status)}`}>{assessmentConclusion(assessment, historical)}</p>
    <SourceLine assessment={assessment} />
    {assessment.reasons.length ? <p className="mt-1 text-sm text-[#8a5417]">{assessment.reasons.join("; ")}</p> : null}
    <div className="mt-2">{assessment.criteria.map((criterion) => <CriterionDetails key={criterion.code} criterion={criterion} />)}</div>
  </div>;
}

export function AaoHnsReferralPanel({ current, originalBaseline, className = "" }: {
  current: AaoHnsReferralAssessment;
  originalBaseline?: AaoHnsReferralAssessment | null;
  className?: string;
}) {
  const historical = current.section === "B" ? originalBaseline : null;
  return <section className={`border-y border-[#bcc4bf] bg-[#fafaf7]/55 p-5 ${className}`}>
    <p className="hg-technical-label">AAO-HNS 1983 · Audiological criteria</p>
    <h2 className="mt-1 text-lg font-semibold text-[#18201e]">เกณฑ์พิจารณาส่งต่อแพทย์หู คอ จมูก</h2>
    <AssessmentDetails assessment={current} />
    {historical ? <AssessmentDetails assessment={historical} historical /> : null}
    {current.status === "MEETS_CRITERIA" ? <p className="mt-3 text-xs leading-5 text-[#6d4915]">ตามแนวทางต้นทาง แพทย์อาจส่งต่อโดยตรงหรือพิจารณาตรวจยืนยันภายใน 90 วันนับจากวันตรวจที่เข้าเกณฑ์; ผลย้อนหลังไม่ใช่การสร้างนัดใหม่</p> : null}
    <p className="mt-3 text-xs leading-5 text-[#68716e]">ผลนี้เป็นเครื่องช่วยพิจารณา ไม่ใช่การวินิจฉัยหรือหลักฐานว่าได้ส่งต่อแล้ว · Medical criteria และลักษณะกราฟที่ต้องใช้ดุลยพินิจแพทย์ยังไม่ได้ประเมิน · ไม่เปลี่ยนผลกฎไทย/OSHA</p>
  </section>;
}

function positiveEvidence(criterion: ReferralCriterionResult): string {
  if (criterion.code === "A.2" || criterion.code === "A.3") {
    return `${referralCriterionEvidence(criterion).join(" · ")}`;
  }
  const matchingEars = criterion.earAverages.filter((item) =>
    criterion.code === "A.1"
      ? item.currentDbHl !== null && item.currentDbHl > criterion.cutoffDb
      : item.changeDb !== null && item.changeDb > criterion.cutoffDb,
  );
  return matchingEars.map((item) => criterion.code === "A.1"
    ? `${earLabel(item.ear)} ${db(item.currentDbHl)}`
    : `${earLabel(item.ear)} Baseline ${db(item.originalBaselineDbHl)} → ผลครั้งนี้ ${db(item.currentDbHl)} (แย่ลง ${db(item.changeDb)})`,
  ).join(" · ");
}

function historicalSummary(assessment: AaoHnsReferralAssessment | null | undefined): string | null {
  if (!assessment) return null;
  const prefix = `Baseline ครั้งแรก ${formatDate(assessment.currentExamDate)} (ข้อมูลย้อนหลัง): `;
  if (assessment.status === "MEETS_CRITERIA") return `${prefix}เคยเข้าเกณฑ์พิจารณาส่งต่อ`;
  if (assessment.status === "NOT_EVALUABLE") return `${prefix}ประเมินไม่ได้ครบถ้วน`;
  return `${prefix}ไม่เข้าเกณฑ์เชิงตัวเลข`;
}

function historicalCriterionEvidence(criterion: ReferralCriterionResult): string {
  const frequencies = criterion.frequenciesHz.map((value) => value.toLocaleString("en-US")).join("/");
  if (criterion.code === "A.1") {
    const matchingEars = criterion.earAverages.filter((item) =>
      item.currentDbHl !== null && item.currentDbHl > criterion.cutoffDb,
    );
    return `${matchingEars.map((item) => `ค่าเฉลี่ย${earLabel(item.ear)}ที่ ${frequencies} Hz = ${db(item.currentDbHl)}`).join(" · ")} (เกณฑ์มากกว่า ${criterion.cutoffDb} dB HL)`;
  }
  const averages = criterion.earAverages.map((item) => `${earLabel(item.ear)} ${db(item.currentDbHl)}`).join(" · ");
  return `ผลต่างค่าเฉลี่ยระหว่างหูที่ ${frequencies} Hz: ${averages} · ผลต่างระหว่างหู ${criterion.interauralDifferenceDb === null ? "—" : Number(criterion.interauralDifferenceDb.toFixed(2))} dB (เกณฑ์มากกว่า ${criterion.cutoffDb} dB)`;
}

function CompactReferralResult({ current, originalBaseline }: {
  current: AaoHnsReferralAssessment;
  originalBaseline?: AaoHnsReferralAssessment | null;
}) {
  const positive = current.criteria.filter((criterion) => criterion.status === "MEETS_CRITERIA");
  const unavailable = current.criteria.filter((criterion) => criterion.status === "NOT_EVALUABLE");
  const historicalAssessment = current.section === "B" ? originalBaseline : null;
  const historical = historicalSummary(historicalAssessment);
  const historicalPositive = historicalAssessment?.criteria.filter((criterion) => criterion.status === "MEETS_CRITERIA") ?? [];
  const historicalUnavailable = historicalAssessment?.criteria.filter((criterion) => criterion.status === "NOT_EVALUABLE") ?? [];
  return <>
    <p className={reportOutcomeClass(current.status)}>{assessmentConclusion(current)}</p>
    {positive.length > 0 ? <ul className="mt-2 space-y-1 pl-5 text-sm">
      {positive.map((criterion) => <li key={criterion.code} className="list-disc">
        <strong>ข้อ {criterion.code}</strong> · {CRITERION_DESCRIPTION[criterion.code]}: {positiveEvidence(criterion)}
      </li>)}
    </ul> : null}
    {unavailable.length > 0 ? <p className="mt-2 text-sm text-[#8a5417]">ข้อ {unavailable.map((item) => item.code).join(", ")} ประเมินไม่ได้{current.reasons.length === 0 ? " เพราะข้อมูลความถี่ที่ใช้คำนวณไม่ครบ" : ""}</p> : null}
    {current.reasons.length > 0 ? <p className="mt-2 text-sm text-[#8a5417]">{current.reasons.join("; ")}</p> : null}
    {historical ? <div className="mt-2 text-sm text-[#68716e]"><p className={reportOutcomeClass(historicalAssessment!.status)}>{historical}</p>
      {historicalPositive.length > 0 ? <ul className="mt-1 space-y-1 pl-5">
        {historicalPositive.map((criterion) => <li key={criterion.code} className="list-disc"><strong>ข้อ {criterion.code}</strong>: {historicalCriterionEvidence(criterion)}</li>)}
      </ul> : null}
      {historicalUnavailable.length > 0 ? <p className="mt-1">ข้อ {historicalUnavailable.map((item) => item.code).join(", ")} ของ Baseline ครั้งแรกประเมินไม่ได้</p> : null}
    </div> : null}
  </>;
}

export function AaoHnsReferralReport({ current, originalBaseline, className = "" }: {
  current: AaoHnsReferralAssessment;
  originalBaseline?: AaoHnsReferralAssessment | null;
  className?: string;
}) {
  return <section className={`border-y border-[#bcc4bf] bg-[#fafaf7]/55 p-5 ${className}`}>
    <h2 className="text-lg font-semibold text-[#18201e]">เกณฑ์พิจารณาส่งต่อแพทย์หู คอ จมูก · AAO-HNS 1983</h2>
    <div className="mt-2"><CompactReferralResult current={current} originalBaseline={originalBaseline} /></div>
    {current.status === "MEETS_CRITERIA" ? <p className="mt-3 text-xs leading-5 text-[#6d4915]">แพทย์อาจพิจารณาส่งต่อหรือตรวจยืนยันภายใน 90 วันนับจากวันตรวจที่เข้าเกณฑ์; ผลย้อนหลังไม่ใช่นัดใหม่</p> : null}
    <p className="mt-3 text-xs leading-5 text-[#68716e]">ผลนี้พิจารณาจากตัวเลขการได้ยินเท่านั้น ยังไม่ได้ประเมินข้อมูลทางการแพทย์หรือรูปแบบกราฟที่แพทย์ต้องดูร่วมด้วย การเข้าเกณฑ์ไม่ใช่คำวินิจฉัย และไม่ได้หมายความว่าส่งต่อแล้ว</p>
  </section>;
}

export function AaoHnsReferralPrintSummary({ current, originalBaseline }: {
  current: AaoHnsReferralAssessment | null;
  originalBaseline: AaoHnsReferralAssessment | null;
}) {
  return <section className="hg-print-referral-summary"><h2>04 · AAO-HNS 1983 · เกณฑ์พิจารณาส่งต่อ</h2>
    {current ? <CompactReferralResult current={current} originalBaseline={originalBaseline} /> : <p>ยังไม่ประเมิน: ต้องเป็นผลตรวจ Final</p>}
    {current?.status === "MEETS_CRITERIA" ? <p className="hg-print-muted">แพทย์อาจพิจารณาส่งต่อหรือตรวจยืนยันภายใน 90 วันจากวันตรวจที่เข้าเกณฑ์; ผลย้อนหลังไม่ใช่นัดใหม่</p> : null}
    <p className="hg-print-muted">ผลนี้พิจารณาจากตัวเลขการได้ยินเท่านั้น ยังไม่ได้ประเมินข้อมูลทางการแพทย์หรือรูปแบบกราฟที่แพทย์ต้องดูร่วมด้วย การเข้าเกณฑ์ไม่ใช่คำวินิจฉัย และไม่ได้หมายความว่าส่งต่อแล้ว</p>
  </section>;
}
