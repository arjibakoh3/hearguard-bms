import type { ReactNode } from "react";
import { compactPrintText, evaluationNeedsAppendix, printThresholdLabel, type AudiogramPrintModel } from "@/application/audiogram-print-model";
import { PAPERLESS_HISTORY_QUESTIONS, type PaperlessAudiogramRecord } from "@/application/paperless-audiometry-models";
import type { EvaluationSummary, ReportImportantHearingCondition } from "@/application/view-models";
import { evaluationEvidence, evaluationOutcome, evaluationRecommendedAction, evaluationTitle, reportOutcomeClass, reportValidationNotice, reportValidityLabel } from "@/application/report-presentation";
import { SUPPORTED_FREQUENCIES_HZ } from "@/domain/hearing";
import { formatDate, formatDateTime } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { importantHearingCategoryLabel } from "@/components/paperless/important-hearing-history-card";
import { FollowUpWorkflowBadge } from "@/components/ui/status-badge";
import { PrintAudiogramChart } from "./print-audiogram-chart";
import { AaoHnsReferralPrintSummary } from "./aao-hns-referral-panel";
import { NihlPhysicianReviewReport } from "./nihl-physician-review-report";
import { ReportSignature } from "./report-signature";

function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="hg-print-facts" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
}

function PrintEvaluation({ evaluation, compact = false }: { evaluation: EvaluationSummary; compact?: boolean }) {
  const evidence = evaluationEvidence(evaluation);
  const recommendedAction = evaluationRecommendedAction(evaluation);
  const visibleEvidence = compact ? evidence.slice(0, 2) : evidence;
  const visibleReasons = compact ? evaluation.notEvaluableReasons.slice(0, 1) : evaluation.notEvaluableReasons;
  return <div className="hg-print-evaluation">
    <div className="hg-print-evaluation-title"><strong>{evaluationTitle(evaluation)}</strong><span className={reportOutcomeClass(evaluation.status)}>{evaluationOutcome(evaluation)}</span></div>
    {visibleEvidence.map((line, index) => <p key={index}>{line}</p>)}
    {compact && evidence.length > visibleEvidence.length ? <p className="hg-print-muted">อีก {evidence.length - visibleEvidence.length} จุด · ดูรายละเอียดต่อท้าย</p> : null}
    {visibleReasons.map((reason, index) => <p key={index} className="hg-print-muted">{reason}</p>)}
    {compact && evaluation.notEvaluableReasons.length > visibleReasons.length ? <p className="hg-print-muted">หมายเหตุเพิ่มเติมอยู่หน้าต่อท้าย</p> : null}
    {recommendedAction ? <p className="hg-print-action">{compact ? compactPrintText(recommendedAction, 100) : recommendedAction}</p> : null}
  </div>;
}

function earLabel(ear: ReportImportantHearingCondition["earScope"]) {
  return { LEFT: "หูซ้าย", RIGHT: "หูขวา", BOTH: "สองข้าง", UNKNOWN: "ไม่ทราบข้าง" }[ear];
}

function ImportantHistory({ model }: { model: AudiogramPrintModel }) {
  return <section><h3>Important hearing history snapshot</h3>
    {!model.importantHistoryPresent ? <p>ไม่มี snapshot ประวัติสำคัญใน record รุ่นเดิม</p> : !model.importantHistory?.length ? <p>ไม่พบ snapshot ประวัติสำคัญใน record นี้</p> : model.importantHistory.map((item) => <div key={item.id} className="hg-print-history-item">
      <h4>{importantHearingCategoryLabel(item.category)}</h4>
      <p>{earLabel(item.earScope)} · {{ CONGENITAL_OR_CHILDHOOD: "ตั้งแต่กำเนิด/วัยเด็ก", LATER: "เกิดภายหลัง", UNKNOWN: "ไม่ทราบช่วงเริ่ม" }[item.onset]} · {{ PATIENT_OR_FAMILY: "ผู้ป่วย/ญาติแจ้ง", PRIOR_MEDICAL_RECORD: "เวชระเบียนเดิม", PHYSICIAN_CONFIRMED: "แพทย์ยืนยัน" }[item.source]}</p>
      {item.details ? <p>{item.details}</p> : null}
    </div>)}
    <p className="hg-print-muted">ใช้ประกอบการตรวจ ไม่เปลี่ยนผลประเมิน baseline หรือ follow-up อัตโนมัติ</p>
  </section>;
}

function PaperlessDetails({ record }: { record: PaperlessAudiogramRecord }) {
  return <>
    <section><h3>Electronic audiometry record · {record.recordStatus}</h3><p className="hg-print-muted">Record ID {record.id}</p>
      <Facts items={[
        ["ผู้ตรวจ", record.examiner || "—"], ["สถานที่", record.location || "—"],
        ["Audiometer", `${record.audiometerModel || "—"} · ${record.audiometerSerial || "—"}`],
        ["สอบเทียบ", `${formatDate(record.calibrationDate || null)} · ${record.equipmentCalibrationStatus ?? "Legacy"}`],
        ["พักเสียง", record.pretest.quietPeriodHours === null ? record.pretest.quietPeriodAnswer : `${record.pretest.quietPeriodHours} ชั่วโมง`],
        ["Valid", record.isValid ? "Yes" : "No"], ["Finalized", formatDateTime(record.finalizedAt)], ["Updated", formatDateTime(record.updatedAt)],
      ]} />
      {record.testContext ? <p>Test context: {record.testContext}</p> : null}
    </section>
    <section><h3>Pretest history snapshot · {record.pretest.historyCaptureMode}</h3>
      {record.historySource ? <p>ประวัติจาก record {record.historySource.id} · ตรวจเมื่อ {formatDateTime(record.historySource.examinedAt)}</p> : null}
      <Facts items={[
        ["พักเสียง (คำตอบ)", record.pretest.quietPeriodAnswer], ["อุปกรณ์ป้องกันระหว่างพักเสียง", record.pretest.hearingProtectionDuringQuiet],
        ["เสียงนอกงานระดับสูง", record.pretest.highNonoccupationalNoise], ["เวลาหลังสัมผัสเสียง", record.hoursSinceNoiseExposure === null ? "—" : `${record.hoursSinceNoiseExposure} ชั่วโมง`],
      ]} />
      {record.pretest.generalNotes ? <p>{record.pretest.generalNotes}</p> : null}
      <table className="hg-print-history-table"><thead><tr><th>หัวข้อ</th><th>คำตอบ / ข้างหู</th><th>รายละเอียด</th></tr></thead><tbody>{PAPERLESS_HISTORY_QUESTIONS.map((question) => {
        const response = record.historyResponses.find((item) => item.questionCode === question.code);
        return <tr key={question.code}><th>{question.label}</th><td>{response?.answer ?? "ไม่มีข้อมูล"}{response?.earScope ? ` · ${earLabel(response.earScope)}` : ""}</td><td>{response?.details || "—"}</td></tr>;
      })}</tbody></table>
    </section>
    <section><h3>Otoscopy</h3>{record.otoscopyFindings.map((finding) => <div key={finding.ear} className="hg-print-history-item">
      <h4>{earLabel(finding.ear)} · {finding.examinationStatus}</h4>
      <p>{[finding.canalObstruction && "Canal obstruction", finding.abnormalTympanicMembrane && "Abnormal tympanic membrane", finding.perforation && "Perforation", finding.otherFinding && "Other finding"].filter(Boolean).join(" · ") || "No abnormal finding documented"}</p>
      {finding.notes ? <p>{finding.notes}</p> : null}
    </div>)}</section>
    <section><h3>Revision chain</h3><p>Final ไม่ถูกแก้ทับ ฉบับแก้ไขสร้าง record ใหม่และเก็บฉบับเดิมเป็น Superseded</p>
      {record.revisionChain.map((item) => <p key={item.id}>{item.recordStatus} · {formatDateTime(item.examinedAt)} · {item.id}</p>)}
    </section>
  </>;
}

export function AudiogramPrintDocument({ model, record }: { model: AudiogramPrintModel; record?: PaperlessAudiogramRecord }) {
  const longEvaluations = model.evaluations.filter(evaluationNeedsAppendix);
  const validationNotice = reportValidationNotice(model.isValid, model.validationNotes);
  const inlineValidationNote = validationNotice.fullNote !== null
    && Array.from(validationNotice.fullNote).length <= 150;
  const identityValues = [model.name, model.employeeNumber, model.hospitalNumber ?? "", model.organizationName, model.departmentName ?? ""];
  const longIdentity = identityValues.some((value) => compactPrintText(value) !== value);
  const hasHistory = Boolean(model.importantHistory?.length);
  const hasAppendix = Boolean(record || longIdentity || longEvaluations.length || hasHistory
    || (validationNotice.fullNote && !inlineValidationNote));

  return <div className="hg-print-document">
    <article className="hg-print-summary" aria-label="หน้าสรุปผลตรวจ A4">
      <header className="hg-print-heading"><p className="hg-print-kicker">HearGuard / Audiometry report</p><h1>รายงานผลการตรวจการได้ยิน พ.ศ. {Number(model.current.examDate.slice(0, 4)) + 543}</h1>
        <p className="hg-print-muted">ผลเพื่อการเฝ้าระวังการได้ยิน · ไม่ใช่การวินิจฉัยโรค{model.recordStatus ? ` · ${model.recordStatus}` : ""}</p>
      </header>
      <Facts items={[
        ["ชื่อ–สกุล", compactPrintText(model.name)], ["รหัสพนักงาน", compactPrintText(model.employeeNumber)], ["HN โรงพยาบาล", compactPrintText(model.hospitalNumber ?? "—")],
      ]} />
      <Facts items={[
        ["บริษัท / สถานประกอบการ", compactPrintText(model.organizationName)], ["แผนก", compactPrintText(model.departmentName ?? "ไม่ระบุ")],
        ["วันเวลาตรวจ", formatDateTime(model.examinedAt)], ["ประเภทผลตรวจ", audiogramTypeLabel(model.examType)],
      ]} />
      <p className="hg-print-validity"><strong>ความใช้ได้ของข้อมูล:</strong> {reportValidityLabel(model.isValid)}</p>
      {validationNotice.summary ? <p className="hg-print-warning">{validationNotice.summary}{validationNotice.fullNote && !inlineValidationNote ? " · หมายเหตุเต็มอยู่หน้าต่อท้าย" : ""}</p> : null}
      {inlineValidationNote ? <p className="hg-print-muted">หมายเหตุที่บันทึกไว้: {validationNotice.fullNote}</p> : null}
      <section className="hg-print-chart-section"><h2>01 · Audiogram</h2>
        <div className="hg-print-legend"><span className="hg-print-right">ขวา O</span><span className="hg-print-left">ซ้าย X</span><span>เส้นทึบ: ผลครั้งนี้ · {formatDate(model.current.examDate)}</span>{model.baseline && model.baseline.id !== model.current.id ? <span>เส้นประ: Baseline อ้างอิง · {formatDate(model.baseline.examDate)}</span> : null}</div>
        {!model.baseline ? <p className="hg-print-muted">ไม่มี Baseline ที่อ้างอิงกับผลตรวจครั้งนี้</p> : null}
        <PrintAudiogramChart current={model.current} baseline={model.baseline} />
        <p className="hg-print-chart-note">dB HL ค่าน้อยอยู่ด้านบน · NR และ Not tested ไม่ถูกแทนด้วย 0</p>
      </section>
      <section><h2>02 · Pure-tone thresholds (dB HL)</h2>
        <table className="hg-print-thresholds"><thead><tr><th>หู / Hz</th>{SUPPORTED_FREQUENCIES_HZ.map((frequency) => <th key={frequency}>{frequency}</th>)}</tr></thead><tbody>{(["RIGHT", "LEFT"] as const).map((ear) => <tr key={ear}><th className={ear === "RIGHT" ? "hg-print-right" : "hg-print-left"}>{ear === "RIGHT" ? "ขวา O / Right" : "ซ้าย X / Left"}</th>{SUPPORTED_FREQUENCIES_HZ.map((frequency) => <td key={frequency}>{printThresholdLabel(model.current, ear, frequency)}</td>)}</tr>)}</tbody></table>
        <p className="hg-print-muted">NR = ไม่ตอบสนองที่ระดับที่ทดสอบ · Not tested = ไม่ได้ทดสอบ</p>
      </section>
      <section><h2>03 · ผลประเมิน</h2>
        {model.evaluations.length ? <div className="hg-print-evaluations">{model.evaluations.map((evaluation) => <PrintEvaluation key={evaluation.id} evaluation={evaluation} compact />)}</div>
          : <p>ไม่มีผลประเมินตามเกณฑ์ไทยหรือ OSHA สำหรับผลตรวจครั้งนี้</p>}
      </section>
      <AaoHnsReferralPrintSummary current={model.referralScreening} originalBaseline={model.originalBaselineReferralScreening} />
      <NihlPhysicianReviewReport review={model.nihlReview} print />
      {model.followUp !== undefined ? <section><h2>{model.nihlReview ? "06" : "05"} · การติดตามปัจจุบัน <FollowUpWorkflowBadge status={model.followUp?.status ?? null} /></h2>
        <p className="hg-print-muted">สถานะการติดตาม ณ วันออกรายงาน อาจไม่ตรงกับสถานะในวันตรวจ</p>
        {model.followUp ? <Facts items={[["ตรวจพบ", formatDate(model.followUp.detectedDate)], ["กำหนดตรวจซ้ำ", formatDate(model.followUp.repeatDueDate)], ["แพทย์ทบทวน", formatDate(model.followUp.physicianReviewDate)]]} /> : null}
      </section> : null}
      {model.importantHistory !== null ? <p className="hg-print-history-summary"><strong>ประวัติการได้ยินสำคัญ: </strong>{!model.importantHistoryPresent ? "ไม่มี snapshot ใน record รุ่นเดิม" : hasHistory ? `${model.importantHistory.length} รายการ · ดูรายละเอียดต่อท้าย` : "ไม่พบ snapshot ประวัติสำคัญใน record นี้"}</p> : null}
      {hasAppendix
        ? <p className="hg-print-muted">ออกรายงานเมื่อ {formatDateTime(model.generatedAt)} · รายละเอียดและหมายเหตุอยู่หน้าต่อท้าย</p>
        : <footer className="hg-print-footer"><p>ออกรายงานเมื่อ {formatDateTime(model.generatedAt)}</p><p>ผลนี้ไม่ใช่การวินิจฉัยโรค การแปลผลขั้นสุดท้ายและการเปลี่ยน baseline ต้องผ่านผู้ประกอบวิชาชีพที่รับผิดชอบ</p></footer>}
    </article>
    {hasAppendix ? <article className="hg-print-appendix" aria-label="รายละเอียดประกอบผลตรวจ">
      <header className="hg-print-heading"><p className="hg-print-kicker">HearGuard / Supporting details</p><h2>รายละเอียดประกอบผลตรวจ</h2><p>{model.name} · {model.employeeNumber}{model.hospitalNumber ? ` · HN ${model.hospitalNumber}` : ""}</p><p>{model.organizationName} · {model.departmentName ?? "ไม่ระบุแผนก"} · {formatDateTime(model.examinedAt)}</p></header>
      {validationNotice.fullNote && !inlineValidationNote ? <section><h3>หมายเหตุประกอบผลตรวจ</h3><p>{validationNotice.fullNote}</p></section> : null}
      {longEvaluations.map((evaluation) => <section key={evaluation.id}><h3>รายละเอียดผลประเมิน</h3><PrintEvaluation evaluation={evaluation} /></section>)}
      {hasHistory || record ? <ImportantHistory model={model} /> : null}
      {record ? <PaperlessDetails record={record} /> : null}
    </article> : null}
    <ReportSignature signer={model.signer} />
  </div>;
}
