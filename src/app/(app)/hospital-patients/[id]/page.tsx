import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, AudioLines, Building2, History, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ImportantHearingHistoryCard } from "@/components/paperless/important-hearing-history-card";
import { formatDate, formatDateTime, getSingleQueryValue } from "@/lib/format";
import { audiogramTypeLabel } from "@/lib/hearing-labels";
import { requireHospitalClinicalActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";
import { addPhysicianConfirmedHearingCondition } from "./actions";

export default async function HospitalPatientTimelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const actor = await requireHospitalClinicalActor();
  const timeline = await getHearGuardPaperlessAudiometryService().getPatientTimeline(id);
  if (!timeline) notFound();

  return <>
    <Link href="/employees" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700"><ArrowLeft aria-hidden="true" size={16} /> กลับไปรายชื่อพนักงาน</Link>
    <PageHeader
      eyebrow={`Hospital patient · HN ${timeline.hospitalNumber}`}
      title={timeline.displayName}
      description="Timeline ตามบุคคลสำหรับทีมโรงพยาบาล แต่ละบริษัทมี employee record, baseline และ follow-up แยกจากกัน"
    />
    <ImportantHearingHistoryCard conditions={timeline.importantHistory} className="mb-6" />
    {raw.historySaved === "1" ? <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">บันทึกประวัติที่แพทย์ยืนยันแล้ว</p> : null}
    {getSingleQueryValue(raw.error) ? <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">{getSingleQueryValue(raw.error)}</p> : null}
    {actor.canReviewBaseline && timeline.employments[0] ? <details className="mb-6 rounded-xl border border-amber-200 bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-amber-900">แพทย์บันทึกประวัติการได้ยินสำคัญที่ยืนยันแล้ว</summary><form action={addPhysicianConfirmedHearingCondition} className="grid gap-3 border-t border-amber-100 p-5 md:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="patientId" value={timeline.patientId} /><input type="hidden" name="employeeId" value={timeline.employments[0].employeeId} /><select required name="category" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="PRE_EXISTING_HEARING_LOSS">สูญเสียการได้ยิน/หูดับเดิม</option><option value="PRE_EXISTING_HEARING_DISABILITY">ความพิการทางการได้ยินเดิม</option><option value="OTHER_IMPORTANT_HEARING_HISTORY">ประวัติสำคัญอื่น</option></select><select required name="earScope" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="LEFT">หูซ้าย</option><option value="RIGHT">หูขวา</option><option value="BOTH">สองข้าง</option><option value="UNKNOWN">ไม่ทราบข้าง</option></select><select required name="onset" className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="CONGENITAL_OR_CHILDHOOD">กำเนิด/วัยเด็ก</option><option value="LATER">เกิดภายหลัง</option><option value="UNKNOWN">ไม่ทราบ</option></select><input name="details" placeholder="รายละเอียด" className="h-11 rounded-lg border border-slate-200 px-3 text-sm" /><button className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2 xl:col-span-1">บันทึกแบบแพทย์ยืนยัน</button></form></details> : null}

    {timeline.transitions.some((item) => item.status === "PENDING_ADMIN_REVIEW") ? <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950"><ShieldAlert aria-hidden="true" className="mt-0.5 shrink-0" size={19} /><div><p className="font-semibold">มีรายการย้ายบริษัทรอ Hospital Admin</p><p className="mt-1">ข้อมูลบริษัทใหม่ใช้งานได้แล้ว แต่ employment เดิมยังไม่ถูกปิดจนกว่าจะผ่านการทบทวน</p></div></div> : null}

    <div className="space-y-6">
      {timeline.employments.map((employment) => <section key={employment.employeeId} className="hg-table-frame overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Building2 aria-hidden="true" size={20} /></span><div><h2 className="font-semibold text-slate-950">{employment.organizationNameTh ?? employment.organizationName}</h2><p className="mt-1 text-sm text-slate-500">รหัสพนักงาน {employment.employeeNumber} · {employment.fullName}</p><p className="mt-1 text-xs text-slate-500">{formatDate(employment.employmentStartDate)} – {employment.employmentEndDate ? formatDate(employment.employmentEndDate) : "ปัจจุบัน"}</p></div></div>
          <div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hg-ink-soft)]"><span className={`size-1.5 ${employment.active ? "bg-[var(--hg-petrol)]" : "bg-[var(--hg-muted)]"}`} />{employment.active ? "Active" : "Ended"}</span><Link href={`/employees/${employment.employeeId}`} className="border border-[var(--hg-rule-strong)] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">เปิด Employee Profile</Link></div>
        </div>
        <dl className="grid gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Thai operational baseline</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{employment.activeBaselineDate ? formatDate(employment.activeBaselineDate) : "ยังไม่มีในบริษัทนี้"}</dd></div><div><dt className="text-xs text-slate-500">Open follow-up</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{employment.openFollowUpStatus ?? "No case"}</dd></div><div><dt className="text-xs text-slate-500">Audiograms</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{employment.audiograms.length} records</dd></div></dl>
        {employment.audiograms.length === 0 ? <div className="px-5 py-7 text-sm text-slate-500">ยังไม่มีผลตรวจของ employment นี้</div> : <div className="divide-y divide-slate-100">{employment.audiograms.map((audiogram) => <Link key={audiogram.id} href={`/paperless-audiometry/${audiogram.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><AudioLines aria-hidden="true" className="text-teal-700" size={18} /><div><p className="font-semibold text-slate-900">{audiogramTypeLabel(audiogram.examType)}</p><p className="mt-1 text-xs text-slate-500">{formatDateTime(audiogram.examinedAt)}</p></div></div><span className="text-xs font-semibold text-slate-500">{audiogram.recordStatus}</span></Link>)}</div>}
      </section>)}
    </div>

    {timeline.transitions.length > 0 ? <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><History aria-hidden="true" className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">Employment transitions</h2></div><div className="mt-4 space-y-3">{timeline.transitions.map((transition) => <div key={transition.id} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"><p className="font-semibold text-slate-800">{transition.transitionMode === "TRANSFER" ? "ย้ายบริษัท" : "ทำงานหลายบริษัท"} · {formatDate(transition.effectiveDate)}</p><p className="mt-1 text-xs text-slate-500">{transition.status}</p></div>)}</div></section> : null}
  </>;
}
