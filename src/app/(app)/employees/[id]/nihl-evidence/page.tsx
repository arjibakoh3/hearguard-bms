import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  AudioWaveform,
  ClipboardCheck,
  Ear,
  Factory,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { evaluateNihlEvidence, type NihlEvidenceResult } from "@/domain/hearing";
import { formatDate, formatDateTime } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { getHearGuardNihlEvidenceService } from "@/lib/server/hearguard-nihl-evidence-service";
import { requireHospitalClinicalActor } from "@/lib/server/current-actor";
import { NihlPhysicianReviewPanel } from "@/components/reports/nihl-physician-review-panel";
import { amendNihlReview, refreshNihlEvidence, reviewNihlEvidence, saveNoiseExposurePeriod } from "./actions";

const stateLabels: Record<NihlEvidenceResult["state"], { title: string; detail: string; tone: string }> = {
  EXPOSURE_AND_PATTERN_COMPATIBLE: { title: "Exposure and pattern compatible", detail: "หลักฐาน exposure และรูปทรง audiogram สอดคล้องกัน", tone: "text-[#175d58] border-[#1d6c67]" },
  COMPATIBLE_WITH_MIXED_FACTORS: { title: "Compatible with mixed factors", detail: "เสียงอาจมีส่วนร่วม แต่มีปัจจัยอื่นที่ต้องชั่งน้ำหนัก", tone: "text-[#7a5016] border-[#ad741f]" },
  ATYPICAL_FEATURES_PRESENT: { title: "Atypical features present", detail: "พบลักษณะที่ควรทบทวนสาเหตุอื่นก่อน attribution", tone: "text-[#8a3e2c] border-[#a74e38]" },
  CURRENT_EVIDENCE_NOT_SUPPORTIVE: { title: "Current evidence not supportive", detail: "หลักฐานปัจจุบันยังไม่สนับสนุนร่วมกัน แต่ไม่ใช่การ rule out", tone: "text-[#4d5956] border-[#87918d]" },
  INSUFFICIENT_DATA: { title: "Insufficient data", detail: "ข้อมูลหลักยังไม่พอสำหรับ suggestion ที่มีความหมาย", tone: "text-[#5a5f5d] border-[#9da5a1]" },
};

function Readout({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-t border-[#c8ceca] py-4"><dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#68716e]">{label}</dt><dd className="mt-2 font-mono text-xl tabular-nums text-[#18201e]">{value}</dd><p className="mt-1 text-xs leading-5 text-[#68716e]">{detail}</p></div>;
}

function EvidenceRow({ index, title, state, explanation }: { index: string; title: string; state: string; explanation: string }) {
  return <div className="grid gap-2 border-t border-[#d5dad5] py-4 md:grid-cols-[3rem_13rem_13rem_1fr]"><span className="font-mono text-[10px] text-[#7b8581]">{index}</span><h3 className="text-sm font-semibold text-[#18201e]">{title}</h3><p className="font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#1d6c67]">{state.replaceAll("_", " ")}</p><p className="text-sm leading-6 text-[#59635f]">{explanation}</p></div>;
}

export default async function NihlEvidencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await requireHospitalClinicalActor();
  const query = await searchParams;
  const requestedAudiogram = typeof query.audiogram === "string" && z.uuid().safeParse(query.audiogram).success ? query.audiogram : null;
  const [workspace, profile] = await Promise.all([
    getHearGuardNihlEvidenceService().getWorkspace(id, requestedAudiogram),
    getHearGuardReadService().getEmployeeProfile(id),
  ]);
  if (!workspace || !profile) notFound();

  const preview = workspace.currentAudiogram ? evaluateNihlEvidence({
    currentAudiogram: workspace.currentAudiogram,
    longitudinalAudiograms: workspace.audiograms,
    exposurePeriods: workspace.exposurePeriods,
    alternativeContributors: workspace.alternativeContributors,
    accessLimited: workspace.accessLimited,
    identityScope: workspace.identity.identityScope,
  }) : null;
  const result = workspace.latestAssessment?.result ?? preview;
  const state = result ? stateLabels[result.state] : null;
  const selectedIsPersisted = workspace.latestAssessment?.currentAudiogramId === workspace.currentAudiogram?.id;
  const rawMessage = typeof query.error === "string" ? query.error : null;
  const saved = typeof query.saved === "string" ? query.saved : null;
  const canReviewThisEmployee = actor.physicianOrganizationIds.includes(workspace.identity.organizationId);

  return <>
    <Link href={`/employees/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#59635f] hover:text-[#1d6c67]"><ArrowLeft size={16} /> กลับ Employee Profile</Link>

    <header className="border-y border-[#aeb7b2] bg-[#f8f8f4] px-5 py-6 sm:px-7">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="hg-technical-label">Clinical evidence workstation · suggestion only</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#18201e]">NIHL Evidence Review</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#59635f]">{workspace.identity.fullName} · {workspace.identity.hospitalNumber ? `HN ${workspace.identity.hospitalNumber}` : `รหัสพนักงาน ${workspace.identity.employeeNumber}`} · {workspace.identity.organizationName}</p></div>
        <div className="flex flex-wrap gap-2">
          {workspace.currentAudiogram ? <form action={refreshNihlEvidence}><input type="hidden" name="employeeId" value={id} /><input type="hidden" name="audiogramId" value={workspace.currentAudiogram.id} /><button className="hg-interactive hg-pressable inline-flex items-center gap-2 border border-[#1d6c67] px-3.5 py-2 text-sm font-semibold text-[#175d58] hover:bg-[#e8f0ed]"><RefreshCw size={15} /> บันทึก snapshot ของผลที่เลือก</button></form> : null}
        </div>
      </div>
    </header>

    {workspace.identity.identityScope === "EMPLOYEE_ONLY" ? <div className="mt-5 border-l-2 border-[#ad741f] bg-[#faf7f0] px-4 py-3 text-sm leading-6 text-[#5b421e]"><strong>ข้อมูลเฉพาะพนักงานรายนี้—ยังไม่เชื่อม HN</strong><p>ผลนี้อาจไม่รวมประวัติการได้ยินและการสัมผัสเสียงจากการทำงานที่อื่น จึงจัดความครบถ้วนของ snapshot เป็นข้อมูลบางส่วน (Partial) และไม่ใช้แทนการทบทวนประวัติทั้งหมดของแพทย์</p></div> : null}

    {rawMessage ? <div className="mt-5 border-l-2 border-[#a74e38] bg-[#f6ece8] px-4 py-3 text-sm text-[#71382a]">{rawMessage}</div> : null}
    {saved ? <div className="mt-5 border-l-2 border-[#1d6c67] bg-[#eaf1ee] px-4 py-3 text-sm text-[#175d58]">บันทึกข้อมูลเรียบร้อยแล้ว</div> : null}

    <section className="mt-7 grid gap-6 border-b border-[#aeb7b2] pb-7 lg:grid-cols-[1.45fr_0.55fr]">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>{state ? <><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#68716e]">Current compatibility marker</p><div className={`mt-2 border-l-2 pl-4 ${state.tone}`}><h2 className="text-xl font-semibold">{state.title}</h2><p className="mt-1 text-sm">{state.detail}</p></div></> : <p className="text-sm text-[#68716e]">ยังไม่มี Final audiogram ที่ valid</p>}</div>
          <form className="flex items-end gap-2" method="get"><label className="text-xs font-semibold text-[#59635f]">Audiogram<select name="audiogram" defaultValue={workspace.currentAudiogram?.id ?? ""} className="mt-1 block min-w-56 border border-[#b8c0bc] bg-white px-3 py-2 text-sm">{workspace.audiograms.filter((item) => item.isValid).sort((a, b) => b.examinedAt.localeCompare(a.examinedAt)).map((item) => <option key={item.id} value={item.id}>{formatDateTime(item.examinedAt)}</option>)}</select></label><button className="hg-interactive hg-pressable border border-[#59635f] px-3 py-2 text-sm">ดู</button></form>
        </div>
        <div className="mt-6 border-l-2 border-[#5f6d69] bg-[#eef0ed] px-4 py-3 text-sm leading-6 text-[#37413e]"><strong>ไม่ใช่การวินิจฉัย:</strong> หน้านี้จัดระเบียบหลักฐานเพื่อช่วยแพทย์ตัดสินใจ ไม่คำนวณ ISO 1999 NIPTS ไม่หัก presbycusis และไม่เปลี่ยน baseline หรือ Thai follow-up อัตโนมัติ</div>
      </div>
      <dl className="grid grid-cols-2 gap-x-5">
        <Readout label="Exposure span" value={`${result?.exposure.totalExposureYears ?? 0} y`} detail={`${workspace.exposurePeriods.length} ช่วงงาน`} />
        <Readout label="Audiograms" value={`${result?.longitudinal.audiogramCount ?? 0}`} detail={`${result?.longitudinal.observationYears ?? 0} ปีที่ติดตาม`} />
        <Readout label="Raw max dose" value={result?.exposure.maxRawDailyDosePercent === null || result?.exposure.maxRawDailyDosePercent === undefined ? "—" : `${result.exposure.maxRawDailyDosePercent}%`} detail="NIOSH 85 dBA / 3 dB" />
        <Readout label="Snapshot" value={selectedIsPersisted ? "Saved" : "Preview"} detail={workspace.latestAssessment ? formatDateTime(workspace.latestAssessment.createdAt) : "ยังไม่ persisted"} />
      </dl>
    </section>

    <section className="mt-8">
      <div className="flex items-center gap-2"><FileSearch size={19} className="text-[#1d6c67]" /><h2 className="text-lg font-semibold text-[#18201e]">Evidence dimensions</h2></div>
      <p className="mt-1 text-sm text-[#68716e]">แต่ละมิติรายงานแยกกันเพื่อไม่ให้ marker หนึ่งถูกใช้แทนอีก marker</p>
      {result ? <div className="mt-5 border-b border-[#d5dad5]">
        <EvidenceRow index="01" title="Noise exposure" state={result.exposure.status} explanation={result.exposure.explanation} />
        <EvidenceRow index="02" title="Audiometric notch" state={result.notch.status} explanation={result.notch.explanation} />
        <EvidenceRow index="03" title="Longitudinal context" state={`${result.longitudinal.audiogramCount} RECORDS`} explanation={result.longitudinal.explanation} />
        <EvidenceRow index="04" title="Bilateral symmetry" state={result.symmetry.status} explanation={result.symmetry.explanation} />
        <EvidenceRow index="05" title="Hearing protection" state={result.protection.status} explanation={result.protection.explanation} />
        <EvidenceRow index="06" title="Alternative contributors" state={result.alternatives.length ? `${result.alternatives.length} RECORDED` : "NONE RECORDED"} explanation={result.alternatives.length ? result.alternatives.map((item) => item.label).join(" · ") : "ไม่มี alternative contributor ในข้อมูลที่เข้าถึงได้"} />
      </div> : null}
    </section>

    <section className="mt-8 grid gap-5 md:grid-cols-2">
      <div className="border-t-2 border-[#173f3c] bg-[#f7f7f3] px-5 py-5"><div className="flex items-center gap-2"><AudioWaveform size={18} /><h2 className="font-semibold">Threshold shift surveillance</h2></div><p className="mt-3 font-mono text-xs uppercase tracking-[0.06em] text-[#1d6c67]">Thai latest: {profile.latestThaiEvaluationStatus ?? "NO EVALUATION"}</p><p className="mt-2 text-sm leading-6 text-[#59635f]">เปรียบเทียบ baseline กับ current ที่ความถี่เดียวกันตามกฎ surveillance และใช้จัดการ follow-up</p></div>
      <div className="border-t-2 border-[#875f26] bg-[#faf7f0] px-5 py-5"><div className="flex items-center gap-2"><Ear size={18} /><h2 className="font-semibold">Audiometric notch</h2></div><p className="mt-3 font-mono text-xs uppercase tracking-[0.06em] text-[#875f26]">Shape marker: {result?.notch.status.replaceAll("_", " ") ?? "NOT AVAILABLE"}</p></div>
    </section>

    {result ? <section className="mt-8 border-t border-[#aeb7b2] pt-6"><h2 className="font-semibold text-[#18201e]">Named notch detector trace</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-sm"><thead><tr className="border-y border-[#bfc7c2] bg-[#eceeea] font-mono text-[10px] uppercase tracking-[0.08em] text-[#59635f]"><th className="px-3 py-3">Ear</th><th className="px-3 py-3">Definition</th><th className="px-3 py-3">Result</th><th className="px-3 py-3">Target</th><th className="px-3 py-3">Lower anchor</th><th className="px-3 py-3">Upper anchor</th></tr></thead><tbody>{result.notch.detectors.map((detector) => <tr key={`${detector.ear}-${detector.detector}`} className="border-b border-[#d5dad5]"><td className="px-3 py-3 font-semibold">{detector.ear}</td><td className="px-3 py-3 font-mono text-xs">{detector.detector}</td><td className="px-3 py-3">{!detector.evaluable ? "Not evaluable" : detector.demonstrated ? "Demonstrated" : "Not demonstrated"}</td><td className="px-3 py-3 font-mono tabular-nums">{detector.targetFrequencyHz ? `${detector.targetFrequencyHz} Hz · ${detector.targetDbHl} dB` : "—"}</td><td className="px-3 py-3 font-mono tabular-nums">{detector.lowerAnchorDbHl ?? "—"}</td><td className="px-3 py-3 font-mono tabular-nums">{detector.upperAnchorDbHl ?? "—"}</td></tr>)}</tbody></table></div></section> : null}

    <section className="mt-9 border-t border-[#aeb7b2] pt-6"><div className="flex items-center gap-2"><Factory size={19} className="text-[#1d6c67]" /><h2 className="text-lg font-semibold">{workspace.identity.identityScope === "EMPLOYEE_ONLY" ? "ประวัติสัมผัสเสียงของพนักงานรายนี้" : "Lifetime noise-exposure evidence"}</h2></div>{workspace.exposurePeriods.length ? <div className="mt-5 divide-y divide-[#d5dad5] border-y border-[#d5dad5]">{workspace.exposurePeriods.map((period) => <div key={period.id} className="grid gap-3 py-4 md:grid-cols-[10rem_1fr_12rem]"><div className="font-mono text-xs tabular-nums">{formatDate(period.startDate)}<br />→ {period.endDate ? formatDate(period.endDate) : "ปัจจุบัน"}</div><div><p className="text-sm font-semibold">{period.pattern.replaceAll("_", " ")}{period.impulseNoise ? " · impulse" : ""}</p><p className="mt-1 text-xs text-[#68716e]">{period.hoursPerDay ?? "—"} h/day · {period.daysPerWeek ?? "—"} d/week · {period.weeksPerYear ?? "—"} weeks/year</p></div><div className="font-mono text-xs">{period.sources.map((source) => source.metric === "DAILY_DOSE" ? `${source.dosePercent}% dose` : `${source.levelDbA} dBA ${source.metric}`).join(" · ")}</div></div>)}</div> : <p className="mt-4 text-sm text-[#68716e]">ยังไม่มีข้อมูลการสัมผัสเสียงที่ระบุระดับหรือปริมาณ</p>}</section>

    {actor.canManage ? <section className="mt-9 border-t-2 border-[#1d6c67] bg-[#f5f6f2] px-5 py-6 sm:px-7"><div className="flex items-center gap-2"><ClipboardCheck size={19} /><h2 className="text-lg font-semibold">เพิ่มช่วงประวัติสัมผัสเสียง</h2></div><p className="mt-1 text-sm text-[#68716e]">บันทึก source/provenance ชัดเจน ค่า PPE จะลด dose estimate ได้เฉพาะ PAR + wearing time</p><form action={saveNoiseExposurePeriod} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><input type="hidden" name="employeeId" value={id} />
      <label className="text-xs font-semibold">สถานประกอบการ<input required name="employerName" defaultValue={workspace.identity.organizationName} className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">ตำแหน่งงาน<input name="jobTitle" defaultValue={workspace.identity.jobTitle ?? ""} className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">เริ่มสัมผัส<input required type="date" name="startDate" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">สิ้นสุด<input type="date" name="endDate" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold">ชั่วโมง/วัน<input type="number" name="hoursPerDay" min="0.5" max="24" step="0.5" defaultValue="8" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">วัน/สัปดาห์<input type="number" name="daysPerWeek" min="1" max="7" step="0.5" defaultValue="5" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">สัปดาห์/ปี<input type="number" name="weeksPerYear" min="1" max="53" step="0.5" defaultValue="50" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">ลักษณะเสียง<select name="exposurePattern" defaultValue="FLUCTUATING" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="CONTINUOUS">Continuous</option><option value="INTERMITTENT">Intermittent</option><option value="FLUCTUATING">Fluctuating</option><option value="IMPULSE">Impulse</option><option value="MIXED">Mixed</option><option value="UNKNOWN">Unknown</option></select></label>
      <label className="text-xs font-semibold">Metric<select name="metric" defaultValue="LEX_8H" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="LEX_8H">LEX,8h (dBA)</option><option value="LAEQ_TE">LAeq,T (dBA)</option><option value="DAILY_DOSE">Daily dose (%)</option></select></label><label className="text-xs font-semibold">ระดับเสียง dBA<input type="number" name="levelDbA" min="40" max="160" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Daily dose %<input type="number" name="dosePercent" min="0" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">LAeq duration (h)<input type="number" name="measurementDurationHours" min="0.1" max="24" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label>
      <label className="text-xs font-semibold">Dose exchange rate<input type="number" name="exchangeRateDb" defaultValue="3" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Dose criterion dBA<input type="number" name="criterionLevelDbA" defaultValue="85" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">วันที่ตรวจวัด<input type="date" name="measurementDate" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">แหล่งข้อมูล<select name="measurementKind" defaultValue="PERSONAL_DOSIMETRY" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="PERSONAL_DOSIMETRY">Personal dosimetry</option><option value="AREA_MEASUREMENT">Area measurement</option><option value="REPRESENTATIVE_JOB_GROUP">Representative job group</option><option value="RECORD_REVIEW">Record review</option><option value="PATIENT_RECALL">Patient recall</option></select></label>
      <label className="text-xs font-semibold">ที่มาหลัก<select name="informationSource" defaultValue="MEASURED" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="MEASURED">Measured</option><option value="RECORD_REVIEW">Record review</option><option value="PATIENT_RECALL">Patient recall</option></select></label><label className="text-xs font-semibold">ความเชื่อมั่น<select name="confidence" defaultValue="HIGH" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="HIGH">High</option><option value="MODERATE">Moderate</option><option value="LOW">Low</option><option value="UNKNOWN">Unknown</option></select></label><label className="flex items-center gap-2 self-end border border-[#d5dad5] px-3 py-2 text-sm"><input type="checkbox" name="impulseNoise" /> มี impulse noise</label><label className="flex items-center gap-2 self-end border border-[#d5dad5] px-3 py-2 text-sm"><input type="checkbox" name="verified" /> ตรวจสอบ source แล้ว</label>
      <div className="border-t border-[#c8ceca] pt-4 md:col-span-2 lg:col-span-4"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#68716e]">Optional hearing protection evidence</p></div><label className="text-xs font-semibold">ชนิด PPE<input name="protectionType" placeholder="เว้นว่างได้" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">หลักฐาน attenuation<select name="attenuationMethod" defaultValue="UNKNOWN" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm"><option value="UNKNOWN">Unknown</option><option value="PAR">Individual PAR</option><option value="NRR">Manufacturer NRR</option><option value="NONE">None</option></select></label><label className="text-xs font-semibold">Attenuation dB<input type="number" name="attenuationDb" min="0" max="60" step="0.1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">เวลาที่สวมใส่ %<input type="number" name="wearingTimePercent" min="0" max="100" step="1" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Fit-test date<input type="date" name="fitTestDate" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-semibold md:col-span-2 lg:col-span-3">หมายเหตุ<input name="notes" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><div className="md:col-span-2 lg:col-span-4"><button className="hg-interactive hg-pressable inline-flex items-center gap-2 bg-[#1d2926] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#111916]"><ShieldCheck size={16} /> บันทึกข้อมูลสัมผัสเสียงและอัปเดต snapshot</button></div>
    </form></section> : null}

    <section id="physician-review" className="mt-9 border-t-2 border-[#303936] pt-6"><div className="flex items-center gap-2"><Stethoscope size={20} /><h2 className="text-lg font-semibold">Physician interpretation</h2></div>{workspace.latestAssessment?.review ? <NihlPhysicianReviewPanel key={workspace.latestAssessment.review.id} review={workspace.latestAssessment.review} employeeId={id} audiogramId={workspace.latestAssessment.currentAudiogramId} canEdit={canReviewThisEmployee && workspace.latestAssessment.review.reviewedBy === actor.id && workspace.currentAudiogram?.employeeId === id} action={amendNihlReview} /> : canReviewThisEmployee && workspace.latestAssessment ? <form action={reviewNihlEvidence} className="mt-5 grid gap-4 md:grid-cols-[18rem_1fr_auto] md:items-end"><input type="hidden" name="assessmentId" value={workspace.latestAssessment.id} /><input type="hidden" name="employeeId" value={id} /><label className="text-xs font-semibold">Clinical interpretation<select name="decision" className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2.5 text-sm"><option value="AGREE_COMPATIBLE">Agree: compatible</option><option value="MIXED_OR_MULTIFACTORIAL">Mixed / multifactorial</option><option value="ALTERNATIVE_CAUSE_MORE_LIKELY">Alternative cause more likely</option><option value="DEFER_NEED_MORE_DATA">Defer: need more data</option></select></label><label className="text-xs font-semibold">เหตุผลของแพทย์<textarea required name="reviewNote" rows={3} className="mt-1 w-full border border-[#b8c0bc] bg-white px-3 py-2 text-sm" /></label><button className="hg-interactive hg-pressable inline-flex items-center justify-center gap-2 bg-[#1d2926] px-4 py-2.5 text-sm font-semibold text-white"><Stethoscope size={16} /> บันทึก review</button></form> : <p className="mt-4 text-sm text-[#68716e]">ต้องบันทึก assessment snapshot ก่อน และเฉพาะ occupational physician ที่ได้รับสิทธิ์จึงลงความเห็นได้</p>}</section>

    {workspace.assessmentHistory.length > 0 ? <section className="mt-8 border-t border-[#aeb7b2] pt-5">
      <h2 className="text-sm font-semibold">คำทบทวน NIHL ก่อนหน้า</h2>
      <ul className="mt-3 space-y-3 text-sm">{workspace.assessmentHistory.map((assessment) => <li key={assessment.id} className="border-l-2 border-[#9da7a1] pl-3">
        <p>{assessment.review!.decision.replaceAll("_", " ")} · {formatDateTime(assessment.review!.reviewedAt)}</p>
        <p className="mt-1 text-[#59635f]">{assessment.review!.reviewNote}</p>
        <p className="mt-1 text-xs text-[#68716e]">Snapshot {formatDateTime(assessment.createdAt)} · {assessment.result.identityScope === "EMPLOYEE_ONLY" ? "ข้อมูลเฉพาะพนักงาน" : "ข้อมูลระดับ HN"}</p>
      </li>)}</ul>
    </section> : null}

    {result ? <section className="mt-9 border-t border-[#aeb7b2] py-6"><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-[#875f26]" /><h2 className="font-semibold">Limitations displayed with every assessment</h2></div><ul className="mt-3 space-y-1.5 text-sm leading-6 text-[#59635f]">{result.limitations.map((item) => <li key={item}>— {item}</li>)}</ul></section> : null}
  </>;
}
