import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, AudioLines, Building2, FileText, ShieldCheck } from "lucide-react";
import { AudiogramReportChart } from "@/components/charts/hearing-visualizations";
import { AutoPrintButton } from "@/components/reports/auto-print-button";
import { AudiogramPrintDocument } from "@/components/reports/audiogram-print-document";
import { AaoHnsReferralReport } from "@/components/reports/aao-hns-referral-panel";
import { ReportValidationBanner } from "@/components/reports/report-validation-banner";
import { NihlPhysicianReviewReport } from "@/components/reports/nihl-physician-review-report";
import { ReportEvaluationCard } from "@/components/reports/report-evaluation-card";
import { buildReportPrintModel } from "@/application/audiogram-print-model";
import { reportValidityLabel } from "@/application/report-presentation";
import { importantHearingCategoryLabel } from "@/components/paperless/important-hearing-history-card";
import { FollowUpWorkflowBadge } from "@/components/ui/status-badge";
import type { ProfileAudiogram, ReportImportantHearingCondition } from "@/application/view-models";
import { formatDate, formatDateTime } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { getReportSigningState } from "@/lib/server/report-signer";
import { ReportSignature, ReportSignatureError } from "@/components/reports/report-signature";

const FREQUENCIES = [500, 1000, 2000, 3000, 4000, 6000, 8000] as const;

function thresholdLabel(audiogram: ProfileAudiogram, ear: "LEFT" | "RIGHT", frequencyHz: typeof FREQUENCIES[number]) {
  const point = audiogram.thresholdObservations.find((item) => item.ear === ear && item.frequencyHz === frequencyHz);
  if (!point || point.responseStatus === "NOT_TESTED") return "Not tested";
  if (point.responseStatus === "NO_RESPONSE") return `NR @ ${point.noResponseAtDbHl}`;
  return String(point.thresholdDbHl);
}

function earLabel(value: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN") { return value === "LEFT" ? "หูซ้าย" : value === "RIGHT" ? "หูขวา" : value === "BOTH" ? "สองข้าง" : "ไม่ทราบข้าง"; }
function onsetLabel(value: ReportImportantHearingCondition["onset"]) { return value === "CONGENITAL_OR_CHILDHOOD" ? "ตั้งแต่กำเนิด/วัยเด็ก" : value === "LATER" ? "เกิดภายหลัง" : "ไม่ทราบช่วงเริ่ม"; }
function sourceLabel(value: ReportImportantHearingCondition["source"]) { return value === "PATIENT_OR_FAMILY" ? "ผู้ป่วย/ญาติแจ้ง" : value === "PRIOR_MEDICAL_RECORD" ? "เวชระเบียนเดิม" : "แพทย์ยืนยัน"; }

export default async function EmployeeAudiogramReportPage({ params }: { params: Promise<{ id: string; audiogramId: string }> }) {
  const { id, audiogramId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(audiogramId).success) notFound();
  const [, report] = await Promise.all([
    requireCurrentActor(),
    getHearGuardReadService().getEmployeeAudiogramReport(id, audiogramId),
  ]);
  if (!report) notFound();
  const { signer, error: signerError } = await getReportSigningState();
  if (signerError) return <div className="mx-auto max-w-5xl"><Link href={`/employees/${id}`} className="text-teal-700 underline">กลับไปหน้าพนักงาน</Link><ReportSignatureError message={signerError} /></div>;
  const buddhistYear = Number(report.selectedAudiogram.examDate.slice(0, 4)) + 543;

  return <><article className="employee-report-print-root mx-auto max-w-5xl print:hidden">
    <div className="mb-5 flex items-center justify-between gap-4 print:hidden"><Link href={`/employees/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft size={16} /> กลับไปหน้า Employee Profile</Link><AutoPrintButton /></div>
    <header className="border-y-2 border-[#202827] bg-white px-1 py-5 text-[#18201e]">
      <div className="flex items-start justify-between gap-6"><div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1d6c67]">HearGuard / Audiometry report</p><h1 className="mt-2 text-2xl font-semibold">รายงานผลการตรวจการได้ยิน พ.ศ. {buddhistYear}</h1></div><FileText className="shrink-0 text-[#1d6c67]" size={28} strokeWidth={1.6} /></div>
      <div className="mt-5 grid gap-3 border-t border-[#d5dad5] pt-4 text-sm sm:grid-cols-3"><div><p className="font-mono text-[9px] uppercase tracking-wide text-[#68716e]">พนักงาน</p><p className="mt-1 font-semibold">{report.identity.firstName} {report.identity.lastName}</p></div><div><p className="font-mono text-[9px] uppercase tracking-wide text-[#68716e]">รหัสพนักงาน</p><p className="mt-1 font-mono font-semibold">{report.identity.employeeNumber}</p></div>{report.identity.hospitalNumber ? <div><p className="font-mono text-[9px] uppercase tracking-wide text-[#68716e]">HN โรงพยาบาล</p><p className="mt-1 font-mono font-semibold">{report.identity.hospitalNumber}</p></div> : null}</div>
    </header>

    <section className="report-section mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <ReportFact label="บริษัท / สถานประกอบการ" value={report.identity.organizationName} icon={<Building2 size={17} />} />
      <ReportFact label="แผนก" value={report.identity.departmentName ?? "ไม่ระบุ"} />
      <ReportFact label="วันเวลาตรวจ" value={formatDateTime(report.selectedAudiogram.examinedAt)} icon={<AudioLines size={17} />} />
      <ReportFact label="ประเภทผลตรวจ" value={audiogramTypeLabel(report.selectedAudiogram.examType)} />
      <ReportFact label="ความใช้ได้ของข้อมูล" value={reportValidityLabel(report.selectedAudiogram.isValid)} />
    </section>
    <ReportValidationBanner isValid={report.selectedAudiogram.isValid} validationNotes={report.selectedAudiogram.validationNotes} />

    <section className="report-section mt-5 border-y border-[#c5cbc6] bg-white py-5">
      <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1d6c67]">01 · Audiogram</p><h2 className="mt-1 text-lg font-semibold text-[#18201e]">ผลตรวจเทียบ Baseline</h2></div>
      {!report.baselineAudiogram ? <p className="mt-4 border-l-2 border-[#a56817] bg-[#fff9ed] px-4 py-3 text-sm text-[#6d4915]">ไม่มี Baseline ที่อ้างอิงกับผลตรวจครั้งนี้ จึงแสดงเฉพาะผลตรวจที่เลือก</p> : null}
      <div className="mt-4"><AudiogramReportChart baseline={report.baselineAudiogram} current={report.selectedAudiogram} /></div>
    </section>

    <section className="report-section mt-5 overflow-hidden border-y border-[#c5cbc6] bg-white">
      <div className="border-b border-[#d5dad5] py-4"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1d6c67]">02 · ค่าที่วัดได้</p><h2 className="mt-1 font-semibold text-[#18201e]">ระดับการได้ยินแต่ละความถี่ (dB HL)</h2><p className="mt-1 text-sm text-[#68716e]">NR = ไม่ตอบสนองที่ระดับที่ทดสอบ · Not tested = ไม่ได้ทดสอบ</p></div>
      <table className="w-full text-center text-sm"><thead className="bg-[#f2f1ec] font-mono text-[10px] uppercase tracking-wide text-[#68716e]"><tr><th className="px-3 py-3 text-left">หู</th>{FREQUENCIES.map((frequency) => <th key={frequency} className="px-2 py-3">{frequency}</th>)}</tr></thead><tbody className="divide-y divide-[#d5dad5] font-mono tabular-nums"><tr><th className="px-3 py-3 text-left font-semibold text-[#a33b34]">ขวา O</th>{FREQUENCIES.map((frequency) => <td key={frequency} className="px-2 py-3">{thresholdLabel(report.selectedAudiogram, "RIGHT", frequency)}</td>)}</tr><tr><th className="px-3 py-3 text-left font-semibold text-[#38678a]">ซ้าย X</th>{FREQUENCIES.map((frequency) => <td key={frequency} className="px-2 py-3">{thresholdLabel(report.selectedAudiogram, "LEFT", frequency)}</td>)}</tr></tbody></table>
    </section>

    <section className="mt-5 grid gap-4 lg:grid-cols-2">{report.evaluations.length > 0
      ? report.evaluations.map((evaluation) => <ReportEvaluationCard key={evaluation.id} evaluation={evaluation} />)
      : <div className="report-section col-span-full border-y border-[#c5cbc6] bg-white px-5 py-4 text-sm text-slate-600">ไม่มีผลประเมินตามเกณฑ์ไทยหรือ OSHA สำหรับผลตรวจครั้งนี้</div>}</section>

    <AaoHnsReferralReport className="report-section mt-5" current={report.referralScreening} originalBaseline={report.originalBaselineReferralScreening} />

    <NihlPhysicianReviewReport review={report.nihlReview} />

    <section className="report-section mt-5 border-y border-[#c5cbc6] bg-white py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-[#18201e]">การติดตามปัจจุบัน</h2><p className="mt-1 text-sm text-[#68716e]">สถานะการติดตาม ณ วันออกรายงาน อาจไม่ตรงกับสถานะในวันตรวจ</p></div><FollowUpWorkflowBadge status={report.relatedFollowUp?.status ?? null} /></div>{report.relatedFollowUp ? <dl className="mt-4 grid gap-3 border-t border-[#d5dad5] pt-4 text-sm sm:grid-cols-3"><div><dt className="text-[#68716e]">ตรวจพบ</dt><dd className="mt-1 font-mono font-semibold">{formatDate(report.relatedFollowUp.detectedDate)}</dd></div><div><dt className="text-[#68716e]">กำหนดตรวจซ้ำ</dt><dd className="mt-1 font-mono font-semibold">{formatDate(report.relatedFollowUp.repeatDueDate)}</dd></div><div><dt className="text-[#68716e]">แพทย์ทบทวน</dt><dd className="mt-1 font-mono font-semibold">{formatDate(report.relatedFollowUp.physicianReviewDate)}</dd></div></dl> : null}</section>

    {report.importantHearingHistory !== null ? <section className="report-section mt-5 border-l-2 border-[#a56817] bg-[#fff9ed] px-5 py-4"><p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#a56817]">ประวัติเดิม · Hospital view</p><h2 className="mt-1 font-semibold text-[#4f391b]">Important hearing history snapshot</h2>{report.importantHearingHistory.length === 0 ? <p className="mt-3 text-sm text-[#6d4915]">ไม่พบ snapshot ประวัติสำคัญใน record นี้</p> : <div className="mt-3 divide-y divide-[#e4d4b6]">{report.importantHearingHistory.map((item) => <div key={item.id} className="py-3 text-sm"><p className="font-semibold text-[#4f391b]">{importantHearingCategoryLabel(item.category)}</p><p className="mt-1 text-[#6d4915]">{earLabel(item.earScope)} · {onsetLabel(item.onset)} · {sourceLabel(item.source)}</p>{item.details ? <p className="mt-1 text-[#6d4915]">{item.details}</p> : null}</div>)}</div>}</section> : null}

    <footer className="mt-5 flex items-start gap-3 border-t border-slate-200 py-5 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 shrink-0 text-teal-700" size={17} /><p>ออกรายงานเมื่อ {formatDateTime(report.generatedAt)} · ผลนี้ใช้เพื่อการเฝ้าระวังการได้ยิน ไม่ใช่การวินิจฉัยโรค การแปลผลขั้นสุดท้ายและการเปลี่ยน baseline ต้องผ่านผู้ประกอบวิชาชีพที่รับผิดชอบ</p></footer>
    <ReportSignature signer={signer} />
  </article><AudiogramPrintDocument model={buildReportPrintModel(report, signer)} /></>;
}

function ReportFact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div className="border-l border-[#9da7a1] pl-3"><div className="flex items-center gap-2 font-mono text-[9px] font-medium uppercase tracking-wide text-[#68716e]">{icon}{label}</div><p className="mt-2 text-sm font-semibold leading-5 text-[#18201e]">{value}</p></div>; }
