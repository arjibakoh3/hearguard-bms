import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft,
  AudioLines,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  Gauge,
  History,
  IdCard,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Landmark,
} from "lucide-react";
import {
  AudiogramComparisonChart,
  HearingTrajectoryChart,
} from "@/components/charts/hearing-visualizations";
import { getLatestRuleEvaluation, sortAudiogramsChronologically } from "@/application/audiogram-presentation";
import { SurveillanceExplanation } from "@/components/surveillance/surveillance-explanation";
import { ImportantHearingHistoryCard } from "@/components/paperless/important-hearing-history-card";
import { EmployeeReportLauncher } from "@/components/reports/employee-report-launcher";
import { PageHeader } from "@/components/ui/page-header";
import {
  ClinicalResultBadge,
  EvaluationBadge,
  FollowUpWorkflowBadge,
} from "@/components/ui/status-badge";
import { formatDate, formatDateTime, getSingleQueryValue } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";
import { prepareBaselineSuggestions } from "./actions";
import { assignHearingProtector } from "./actions";
import { HearingProtectionPanel } from "@/components/hearing-protection/hearing-protection-panel";
import { buildAaoHnsReferralContext } from "@/domain/hearing/rules/aao-hns-referral";
import { AaoHnsReferralPanel } from "@/components/reports/aao-hns-referral-panel";

function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] font-medium uppercase tracking-[0.08em] text-[#68716e]">{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold text-[#18201e]">{value}</dd>
    </div>
  );
}

function SummaryCard({ eyebrow, title, detail, tone = "neutral", icon }: { eyebrow: string; title: string; detail: string; tone?: "neutral" | "stable" | "attention" | "baseline"; icon: React.ReactNode }) {
  const toneClass = tone === "stable"
    ? "border-[#1d6c67] text-[#173f3c]"
    : tone === "attention"
      ? "border-[#a56817] text-[#4c3518]"
      : tone === "baseline"
        ? "border-[#1d6c67] text-[#173f3c]"
        : "border-[#bcc4bf] text-[#18201e]";
  return <section className={`border-l-2 bg-[#fafaf7]/35 px-4 py-3.5 ${toneClass}`}><div className="flex items-start gap-3"><span className="mt-0.5 shrink-0 opacity-75">{icon}</span><div className="min-w-0"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.13em] opacity-65">{eyebrow}</p><p className="mt-1.5 text-base font-semibold leading-6">{title}</p><p className="mt-1 text-xs leading-5 opacity-75">{detail}</p></div></div></section>;
}

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [profile, actor, query] = await Promise.all([
    getHearGuardReadService().getEmployeeProfile(id),
    requireCurrentActor(),
    searchParams,
  ]);
  if (!profile) notFound();
  const importantHistory = actor.role === "COMPANY_USER"
    ? null
    : await getHearGuardPaperlessAudiometryService().getImportantHearingHistory(id);

  const latestEvaluation = getLatestRuleEvaluation(
    profile.audiograms, profile.evaluations, "THAI_HEARING_2561",
  );
  const needsAction = profile.followUpStatus !== null
    && profile.followUpStatus !== "CLOSED";
  const actionTone = needsAction || profile.latestThaiEvaluationStatus === "positive"
    ? "attention"
    : profile.latestThaiEvaluationStatus === "negative" || profile.followUpStatus === "CLOSED"
      ? "stable"
      : "neutral";
  const latestAudiogram = [...profile.audiograms]
    .filter((item) => item.isValid)
    .sort((left, right) => new Date(right.examinedAt).getTime() - new Date(left.examinedAt).getTime())[0] ?? null;
  const timelineAudiograms = sortAudiogramsChronologically(profile.audiograms);
  const latestReferral = timelineAudiograms.at(-1)
    ? buildAaoHnsReferralContext(profile.audiograms, timelineAudiograms.at(-1)!)
    : null;
  const audiogramById = new Map(profile.audiograms.map((audiogram) => [audiogram.id, audiogram]));
  const thaiEvaluationHistory = profile.evaluations
    .filter((evaluation) => evaluation.ruleCode === "THAI_HEARING_2561")
    .sort((left, right) =>
      (audiogramById.get(right.currentAudiogramId)?.examDate ?? "")
        .localeCompare(audiogramById.get(left.currentAudiogramId)?.examDate ?? "")
      || right.evaluatedAt.localeCompare(left.evaluatedAt),
    );

  return (
    <>
      <Link
        href="/employees"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
      >
        <ArrowLeft aria-hidden="true" size={16} /> กลับไปรายชื่อพนักงาน
      </Link>

      <PageHeader
        eyebrow={profile.identity.hospitalNumber ? `HN ${profile.identity.hospitalNumber} · ${profile.identity.employeeNumber}` : profile.identity.employeeNumber}
        title={`${profile.identity.firstName} ${profile.identity.lastName}`}
        description={`${profile.identity.organizationName} · ${profile.identity.departmentName ?? "ไม่ระบุแผนก"} · ${profile.identity.jobTitle ?? "ไม่ระบุตำแหน่ง"}`}
        actions={<div className="space-y-3"><div className="flex flex-wrap items-end justify-end gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Clinical result</p><ClinicalResultBadge status={profile.latestThaiEvaluationStatus} /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Follow-up workflow</p><FollowUpWorkflowBadge status={profile.followUpStatus} /></div></div><div className="flex flex-wrap justify-end gap-2"><EmployeeReportLauncher employeeId={profile.identity.id} audiograms={profile.audiograms} />{actor.role !== "COMPANY_USER" ? <Link href={`/employees/${profile.identity.id}/nihl-evidence`} className="hg-interactive hg-pressable inline-flex items-center gap-2 border border-[#1d6c67] bg-white px-3.5 py-2 text-sm font-semibold text-[#175d58] hover:bg-[#eaf1ee]"><Stethoscope aria-hidden="true" size={16} /> NIHL evidence</Link> : null}{actor.role !== "COMPANY_USER" && profile.identity.patientId ? <Link href={`/hospital-patients/${profile.identity.patientId}`} className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><History aria-hidden="true" size={16} /> Timeline ตาม HN</Link> : null}{actor.canManage && profile.identity.hospitalNumber ? <Link href={`/paperless-audiometry/new?employee=${profile.identity.id}`} className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-3.5 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><AudioLines aria-hidden="true" size={16} /> บันทึกผลตรวจ</Link> : null}{actor.canManage ? <form action={prepareBaselineSuggestions}><input type="hidden" name="employeeId" value={profile.identity.id} /><button type="submit" className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3.5 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><Landmark aria-hidden="true" size={16} /> ส่งเข้า baseline review</button></form> : null}</div></div>}
      />

      {getSingleQueryValue(query.protection) === "saved" ? <div className="mb-5 border-l-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">บันทึก hearing protector assignment และ assessment snapshot แล้ว</div> : null}
      {getSingleQueryValue(query.protectionError) ? <div className="mb-5 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{getSingleQueryValue(query.protectionError)}</div> : null}

      <div className="mb-7 grid gap-x-5 gap-y-3 border-y border-[#bcc4bf] py-4 lg:grid-cols-[1.35fr_1fr_1fr]">
        <SummaryCard eyebrow="Next action" title={profile.nextAction} detail="Workflow ที่มีอยู่จะมาก่อนผล Clinical ล่าสุด" tone={actionTone} icon={actionTone === "stable" ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />} />
        <SummaryCard eyebrow="Operational baseline" title={profile.activeBaseline ? formatDate(profile.activeBaseline.examDate) : "ยังไม่มี baseline"} detail={profile.activeBaseline ? `มีผลตั้งแต่ ${formatDate(profile.activeBaseline.effectiveFrom)} · ${profile.activeBaseline.reasonCode.replaceAll("_", " ")}` : "ผลเปรียบเทียบจะ Not evaluable จนกว่าจะอนุมัติ baseline"} tone={profile.activeBaseline ? "baseline" : "attention"} icon={<History size={20} />} />
        <SummaryCard eyebrow="Latest examination" title={latestAudiogram ? formatDateTime(latestAudiogram.examinedAt) : "ยังไม่มีผลตรวจ"} detail={latestAudiogram ? `${audiogramTypeLabel(latestAudiogram.examType)} · ${latestAudiogram.thresholdObservations.length}/14 จุด` : "บันทึก Final audiogram เพื่อเริ่มการติดตาม"} icon={<AudioLines size={20} />} />
      </div>

      {importantHistory ? <ImportantHearingHistoryCard conditions={importantHistory.conditions} className="mb-6" /> : null}

      <section className="mb-8 min-w-0 border-y border-[#bcc4bf] bg-[#fafaf7]/55 px-0 py-5 sm:px-5 sm:py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="hg-technical-label">01 · Primary clinical view</p><h2 className="mt-1 text-lg font-semibold text-[#18201e]">Clinical audiogram comparison</h2><p className="mt-1 text-sm text-[#68716e]">แสดง Active baseline และ Latest เป็นค่าเริ่มต้น เลือกผลระหว่างกลางเพิ่มได้สูงสุด 3 records</p></div><span className="font-mono text-[10px] uppercase tracking-wide text-[#68716e]">Final · Valid records</span></div>
        <AudiogramComparisonChart audiograms={profile.audiograms} />
      </section>

      <div className="grid gap-8 xl:grid-cols-[0.72fr_2fr]">
        <div className="space-y-6">
          <section className="border-t border-[#bcc4bf] pt-5">
            <div className="flex items-center gap-2">
              <IdCard aria-hidden="true" className="text-teal-700" size={19} />
              <h2 className="font-semibold text-slate-950">ข้อมูลพนักงาน</h2>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
              {profile.identity.hospitalNumber ? <DataField label="HN โรงพยาบาล" value={profile.identity.hospitalNumber} /> : null}
              <DataField label="รหัสพนักงาน" value={profile.identity.employeeNumber} />
              <DataField label="เพศ" value={profile.identity.sex ?? "ไม่ระบุ"} />
              <DataField label="วันเกิด" value={formatDate(profile.identity.dateOfBirth)} />
              <DataField
                label="เริ่มงาน"
                value={formatDate(profile.identity.employmentStartDate)}
              />
            </dl>
            <div className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
              <div className="flex items-start gap-2.5">
                <Building2 aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={17} />
                <span className="text-slate-700">{profile.identity.organizationName}</span>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={17} />
                <span className="text-slate-700">{profile.identity.departmentName ?? "ไม่ระบุแผนก"}</span>
              </div>
              <div className="flex items-start gap-2.5">
                <BriefcaseBusiness aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" size={17} />
                <span className="text-slate-700">{profile.identity.jobTitle ?? "ไม่ระบุตำแหน่ง"}</span>
              </div>
            </div>
          </section>

          <section className="border-t border-[#bcc4bf] pt-5">
            <div className="flex items-center gap-2">
              <Gauge aria-hidden="true" className="text-teal-700" size={19} />
              <h2 className="font-semibold text-slate-950">Noise exposure</h2>
            </div>
            {profile.noiseExposures.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-500">ยังไม่มีข้อมูลตรวจวัดเสียงที่เชื่อมโยง</p>
            ) : (
              <div className="mt-4 space-y-4">
                {profile.noiseExposures.map((exposure) => (
                  <div key={exposure.id} className="border-y border-[#d5dad5] bg-[#fafaf7]/45 p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {exposure.scope === "EMPLOYEE" ? "รายบุคคล" : "ระดับแผนก"}
                      </p>
                      <span className="text-xs text-slate-500">{formatDate(exposure.measurementDate)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">TWA</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{exposure.twaDbA?.toFixed(1) ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">LEL</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{exposure.lelDbA?.toFixed(1) ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-400">Peak</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{exposure.peakDb?.toFixed(1) ?? "—"}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] text-slate-500">Basis: {exposure.exposureBasis} · dBC {exposure.twaDbC?.toFixed(1) ?? "—"} · {exposure.shiftHours?.toFixed(1) ?? "—"} h</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <HearingProtectionPanel
            employeeId={profile.identity.id}
            canManage={actor.canManage}
            hearingProtection={profile.hearingProtection}
            assignAction={assignHearingProtector}
          />
        </div>

        <div className="space-y-6">
          <section className="overflow-hidden border-t border-[#bcc4bf]">
            <div className="border-b border-[#d5dad5] py-4">
              <div className="flex items-center gap-2">
                <History aria-hidden="true" className="text-teal-700" size={19} />
                <h2 className="font-semibold text-slate-950">Longitudinal hearing timeline</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">Audiogram ทุกครั้งเรียงตามเวลา โดยไม่แก้ไขข้อมูลดิบย้อนหลัง</p>
            </div>
            <div className="min-w-0 py-5">
              <ol className="grid min-w-0 grid-cols-1 gap-x-0 gap-y-6 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
                {timelineAudiograms.map((audiogram) => (
                  <li key={audiogram.id} className="relative min-w-0 border-t border-[#d5dad5] px-2 pt-5 sm:px-3">
                    <span
                      className={`absolute -top-1.5 left-2 z-10 size-3 rounded-full ring-4 ring-[#f7f7f3] sm:left-3 ${
                        audiogram.isActiveBaseline
                          ? "bg-teal-600"
                          : audiogram.clinicalResult === "positive"
                            ? "bg-amber-500"
                            : audiogram.clinicalResult === "not_evaluable"
                              ? "bg-slate-400"
                              : "bg-emerald-500"
                      }`}
                    >
                      <span className="sr-only">จุดเวลา</span>
                    </span>
                    <p className="text-xl font-semibold tracking-tight text-slate-950">
                      {Number(audiogram.examDate.slice(0, 4)) + 543}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(audiogram.examDate)}</p>
                    <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#68716e]">
                      {audiogramTypeLabel(audiogram.examType)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {audiogram.isActiveBaseline ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--hg-petrol)]"><span className="size-1.5 bg-[var(--hg-petrol)]" />Active baseline</span>
                      ) : null}
                      {audiogram.clinicalResult ? (
                        <EvaluationBadge status={audiogram.clinicalResult} />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <div>
            <section className="min-w-0 border-t border-[#bcc4bf] py-5">
              <div className="mb-5">
                <h2 className="font-semibold text-slate-950">Longitudinal hearing trajectory</h2>
                <p className="mt-1 text-sm text-slate-500">เลือกความถี่เพื่อดูแนวโน้มสองหูตามเวลา</p>
              </div>
              <HearingTrajectoryChart audiograms={profile.audiograms} />
            </section>
          </div>

          <SurveillanceExplanation profile={profile} />

          {latestReferral ? <AaoHnsReferralPanel
            current={latestReferral.current}
            originalBaseline={latestReferral.originalBaseline}
          /> : null}

          <section className="hg-table-frame overflow-hidden">
            <div className="flex items-start justify-between gap-4 border-b border-[#bcc4bf] px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <AudioLines aria-hidden="true" className="text-teal-700" size={19} />
                  <h2 className="font-semibold text-slate-950">Audiogram history</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">ข้อมูลดิบทุกครั้งยังคงแสดงครบและตรวจสอบย้อนกลับได้</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{profile.audiograms.length} records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 sm:px-6">วันที่ตรวจ</th>
                    <th className="px-5 py-3">ประเภท</th>
                    <th className="px-5 py-3">Thresholds</th>
                    <th className="px-5 py-3">ผลเฝ้าระวัง</th>
                    <th className="px-5 py-3">ข้อมูล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...profile.audiograms].reverse().map((audiogram) => (
                    <tr key={audiogram.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900 sm:px-6">
                        {formatDate(audiogram.examDate)}
                        {audiogram.isActiveBaseline ? (
                          <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">BASELINE</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{audiogramTypeLabel(audiogram.examType)}</td>
                      <td className="px-5 py-4 font-medium text-slate-700">{audiogram.thresholdObservations.length}/14 จุด</td>
                      <td className="px-5 py-4">
                        {audiogram.clinicalResult ? (
                          <EvaluationBadge status={audiogram.clinicalResult} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {profile.identity.hospitalNumber ? <Link href={`/paperless-audiometry/${audiogram.id}`} className="ml-3 text-xs font-semibold text-teal-700 hover:text-teal-900">Electronic record</Link> : null}
                      </td>
                      <td className="px-5 py-4">
                        {audiogram.isValid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 aria-hidden="true" size={15} /> Valid
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700">Review required</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5">
              <div className="flex items-center gap-2">
                <Stethoscope aria-hidden="true" className="text-teal-700" size={19} />
                <h2 className="font-semibold text-slate-950">Latest evaluation</h2>
              </div>
              {latestEvaluation ? (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <EvaluationBadge status={latestEvaluation.status} />
                    <span className="text-xs text-slate-500">v{latestEvaluation.ruleVersion}</span>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900">{latestEvaluation.ruleName}</p>
                  <p className="mt-1 text-xs text-slate-500">{latestEvaluation.ruleCode}</p>
                  <div className="mt-4 flex justify-between border-t border-slate-100 pt-4 text-sm">
                    <span className="text-slate-500">Triggered findings</span>
                    <span className="font-semibold text-slate-900">{latestEvaluation.findingCount}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">ประเมินเมื่อ {formatDate(latestEvaluation.evaluatedAt)}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">ยังไม่มี evaluation ที่บันทึกไว้</p>
              )}
            </section>

            <section className="border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5">
              <div className="flex items-center gap-2">
                <CalendarClock aria-hidden="true" className="text-teal-700" size={19} />
                <h2 className="font-semibold text-slate-950">Follow-up case</h2>
              </div>
              {profile.latestFollowUp ? (
                <div className="mt-4">
                  <FollowUpWorkflowBadge status={profile.latestFollowUp.status} />
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">ตรวจพบ</dt>
                      <dd className="font-medium text-slate-800">{formatDate(profile.latestFollowUp.detectedDate)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">กำหนดตรวจซ้ำ</dt>
                      <dd className="font-medium text-slate-800">{formatDate(profile.latestFollowUp.repeatDueDate)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">แพทย์ทบทวน</dt>
                      <dd className="font-medium text-slate-800">{formatDate(profile.latestFollowUp.physicianReviewDate)}</dd>
                    </div>
                  </dl>
                  <Link
                    href={`/surveillance/${profile.latestFollowUp.id}`}
                    className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600"
                  >
                    เปิดรายละเอียดเคส →
                  </Link>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">ไม่มี follow-up case ที่ต้องดำเนินการ</p>
              )}
            </section>
          </div>

          {thaiEvaluationHistory.length > 0 ? (
            <section className="mt-6 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5">
              <h2 className="font-semibold text-slate-950">ประวัติการประเมินกฎไทย</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">ผล v1 เก็บไว้เป็นประวัติการตัดสินเดิม; ผล v2 ใช้เกณฑ์ 500–6000 Hz สำหรับสถานะปัจจุบัน โดยผล 8000 Hz ยังอยู่ใน audiogram และการวิเคราะห์ notch</p>
              <div className="mt-4 space-y-2">
                {thaiEvaluationHistory.map((evaluation) => (
                  <details key={evaluation.id} className="border border-slate-200 px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                      <span className="font-medium text-slate-900">ตรวจ {formatDate(audiogramById.get(evaluation.currentAudiogramId)?.examDate ?? null)}</span>
                      <span className="font-mono text-xs text-slate-500">v{evaluation.ruleVersion}</span>
                      <EvaluationBadge status={evaluation.status} />
                      <span className="text-xs text-slate-500">{evaluation.findingCount} จุด · ประเมิน {formatDateTime(evaluation.evaluatedAt)}</span>
                    </summary>
                    {evaluation.explanation ? <p className="mt-3 text-xs leading-5 text-slate-700">{evaluation.explanation}</p> : null}
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex items-start gap-3 border-l-2 border-[var(--hg-info)] bg-[var(--hg-info-soft)] px-4 py-3.5 text-sm leading-6 text-[#31566f]">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <p>
              ผลในหน้านี้เป็นผลเฝ้าระวัง ไม่ใช่การวินิจฉัยโรค การแปลผลขั้นสุดท้ายและการเปลี่ยน baseline ต้องดำเนินการโดยผู้ประกอบวิชาชีพที่รับผิดชอบ
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
