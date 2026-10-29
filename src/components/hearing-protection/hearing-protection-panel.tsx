import { Headphones, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { EmployeeHearingProtectionSummary } from "@/application/view-models";
import type { HearingProtectionStatus } from "@/domain/hearing-protection";
import { formatDate, formatDateTime } from "@/lib/format";

type Props = {
  employeeId: string;
  canManage: boolean;
  hearingProtection: EmployeeHearingProtectionSummary;
  assignAction: (formData: FormData) => void | Promise<void>;
};

const STATUS_PRESENTATION: Record<
  HearingProtectionStatus,
  { label: string; className: string; icon: typeof ShieldCheck }
> = {
  ADEQUATE: {
    label: "ADEQUATE",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
    icon: ShieldCheck,
  },
  INADEQUATE: {
    label: "INADEQUATE",
    className: "border-red-300 bg-red-50 text-red-800",
    icon: ShieldAlert,
  },
  INSUFFICIENT_DATA: {
    label: "INSUFFICIENT DATA",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    icon: TriangleAlert,
  },
  NOT_EVALUABLE: {
    label: "NOT EVALUABLE",
    className: "border-slate-300 bg-slate-100 text-slate-700",
    icon: TriangleAlert,
  },
};

function protectorTypeLabel(value: string): string {
  if (value === "EARMUFF") return "ที่ครอบหู (Earmuff)";
  if (value === "FOAM_EARPLUG") return "ปลั๊กโฟม (Foam earplug)";
  return "ปลั๊กชนิดอื่น (Other earplug)";
}

function ratingText(nrrDb: number | null, snrDb: number | null): string {
  return [
    nrrDb === null ? null : `NRR ${nrrDb} dB`,
    snrDb === null ? null : `SNR ${snrDb} dB`,
  ].filter(Boolean).join(" · ");
}

function valueDb(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} dBA`;
}

export function HearingProtectionPanel({
  employeeId,
  canManage,
  hearingProtection,
  assignAction,
}: Props) {
  const { currentAssignment, latestAssessment, availableProtectors } = hearingProtection;
  const status = latestAssessment
    ? STATUS_PRESENTATION[latestAssessment.status]
    : null;
  const StatusIcon = status?.icon ?? TriangleAlert;
  const defaultEffectiveFrom = new Date().toISOString().slice(0, 10);

  return (
    <section className="border-t border-[#bcc4bf] pt-5">
      <div className="flex items-center gap-2">
        <Headphones aria-hidden="true" className="text-teal-700" size={19} />
        <h2 className="font-semibold text-slate-950">Hearing Protection</h2>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        ประมาณระดับเสียงที่หูตามวิธีของกฎหมายไทย เป็น decision support ไม่ใช่การวินิจฉัยหรือผล fit test รายบุคคล
      </p>

      {!currentAssignment ? (
        <div className="mt-4 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No hearing protector assignment
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="border-y border-[#d5dad5] bg-[#fafaf7]/45 p-4">
            <p className="text-sm font-semibold text-slate-950">
              {currentAssignment.protector.manufacturer} {currentAssignment.protector.model}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {protectorTypeLabel(currentAssignment.protector.protectorType)} · {ratingText(currentAssignment.protector.nrrDb, currentAssignment.protector.snrDb)}
            </p>
            {currentAssignment.configuration === "DUAL_UNSUPPORTED" ? (
              <p className="mt-2 text-xs font-semibold text-slate-700">
                ใช้ร่วมกับ {currentAssignment.secondaryProtector?.manufacturer} {currentAssignment.secondaryProtector?.model} — ยังไม่มีสูตร Thai dual protection ที่อนุมัติในระบบ
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-slate-500">
              มีผลตั้งแต่ {formatDate(currentAssignment.effectiveFrom)}
            </p>
          </div>

          {latestAssessment && status ? (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 border px-3 py-2 text-xs font-bold tracking-wide ${status.className}`}>
                <StatusIcon aria-hidden="true" size={16} /> {status.label}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-xs text-slate-500">Latest applicable exposure (snapshot)</dt><dd className="mt-1 font-semibold text-slate-900">{[
                  latestAssessment.exposureSnapshot?.levelDbA === null || latestAssessment.exposureSnapshot?.levelDbA === undefined
                    ? null
                    : `${latestAssessment.exposureSnapshot.levelDbA.toFixed(1)} dBA`,
                  latestAssessment.exposureSnapshot?.levelDbC === null || latestAssessment.exposureSnapshot?.levelDbC === undefined
                    ? null
                    : `${latestAssessment.exposureSnapshot.levelDbC.toFixed(1)} dBC`,
                ].filter(Boolean).join(" · ") || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Protected exposure</dt><dd className="mt-1 font-semibold text-slate-900">{valueDb(latestAssessment.protectedExposureDbA)}</dd></div>
                <div><dt className="text-xs text-slate-500">Allowable exposure</dt><dd className="mt-1 font-semibold text-slate-900">{valueDb(latestAssessment.allowableExposureDbA)}</dd></div>
                <div><dt className="text-xs text-slate-500">Protection margin</dt><dd className={`mt-1 font-semibold ${latestAssessment.protectionMarginDb !== null && latestAssessment.protectionMarginDb < 0 ? "text-red-700" : "text-emerald-700"}`}>{latestAssessment.protectionMarginDb === null ? "—" : `${latestAssessment.protectionMarginDb > 0 ? "+" : ""}${latestAssessment.protectionMarginDb.toFixed(1)} dB`}</dd></div>
              </dl>
              <p className="text-[11px] text-slate-500">
                ประเมิน {formatDateTime(latestAssessment.assessedAt)} · ใช้ exposure {latestAssessment.exposureSnapshot ? formatDate(latestAssessment.exposureSnapshot.measurementDate) : "—"} · {latestAssessment.ruleCode} v{latestAssessment.ruleVersion}
              </p>

              <details className="border-y border-slate-200 bg-white px-3 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">ดูวิธีคำนวณ</summary>
                <div className="mt-4 space-y-4">
                  {latestAssessment.calculations.map((calculation) => (
                    <div key={calculation.method} className="border-l-2 border-slate-300 pl-3">
                      <div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-bold text-slate-700">{calculation.method}</p><span className="text-[10px] text-slate-500">{calculation.status}</span></div>
                      {calculation.status === "CALCULATED" ? (
                        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                          <dt className="text-slate-500">Measured exposure</dt><dd>{calculation.measuredExposureDb?.toFixed(1)} dB{calculation.measurementWeighting}</dd>
                          <dt className="text-slate-500">Label {calculation.ratingKind}</dt><dd>{calculation.labelledRatingDb?.toFixed(1)} dB</dd>
                          {calculation.deratingFactor !== null ? <><dt className="text-slate-500">Thai regulatory adjustment</dt><dd>× {calculation.deratingFactor.toFixed(2)}</dd></> : null}
                          {calculation.adjustedNrrDb !== null ? <><dt className="text-slate-500">Adjusted NRR</dt><dd>{calculation.adjustedNrrDb.toFixed(1)} dB</dd></> : null}
                          <dt className="text-slate-500">Weighting correction</dt><dd>{calculation.method === "THAI_NRR_DBA" ? "− 7 dB inside parentheses" : calculation.method === "THAI_SNR" ? "+ 4 dB" : "None"}</dd>
                          <dt className="text-slate-500">Effective attenuation</dt><dd>{calculation.effectiveAttenuationDb?.toFixed(1)} dB</dd>
                          <dt className="text-slate-500">Estimated protected exposure</dt><dd className="font-semibold">{calculation.protectedExposureDbA?.toFixed(1)} dBA</dd>
                        </dl>
                      ) : <p className="mt-2 text-xs leading-5 text-amber-800">{calculation.explanation}</p>}
                      <p className="mt-2 font-mono text-[10px] leading-5 text-slate-500">{calculation.formula}<br />{calculation.explanation}</p>
                    </div>
                  ))}
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-xs">
                    <dt className="text-slate-500">Shift duration</dt><dd>{latestAssessment.exposureSnapshot?.shiftHours?.toFixed(1) ?? "—"} h</dd>
                    <dt className="text-slate-500">Exposure basis</dt><dd>{latestAssessment.exposureSnapshot?.basis ?? "—"}</dd>
                    <dt className="text-slate-500">Governing method</dt><dd>{latestAssessment.governingMethod ?? "—"}</dd>
                    <dt className="text-slate-500">Allowable exposure</dt><dd>{valueDb(latestAssessment.allowableExposureDbA)}</dd>
                    <dt className="text-slate-500">Final margin</dt><dd>{latestAssessment.protectionMarginDb?.toFixed(1) ?? "—"} dB</dd>
                  </dl>
                  {latestAssessment.reasons.length > 0 ? <ul className="space-y-1 text-xs text-amber-800">{latestAssessment.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul> : null}
                  <p className="text-[11px] leading-5 text-slate-500">เมื่อมีหลายวิธีที่ใช้ได้ ระบบเก็บทุกวิธีและใช้ค่าระดับเสียงหลังป้องกันที่สูงที่สุดเป็นผล governing เพื่อความอนุรักษ์นิยม</p>
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มี assessment snapshot สำหรับ assignment นี้</p>
          )}
        </div>
      )}

      {canManage ? (
        availableProtectors.length > 0 ? (
          <details className="mt-5 border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-teal-800">กำหนดหรือเปลี่ยนอุปกรณ์</summary>
            <form action={assignAction} className="mt-4 space-y-3">
              <input type="hidden" name="employeeId" value={employeeId} />
              <label className="block text-xs font-semibold text-slate-700">อุปกรณ์หลัก<select name="hearingProtectorId" required defaultValue={currentAssignment?.protector.id ?? ""} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"><option value="" disabled>เลือกอุปกรณ์</option>{availableProtectors.map((protector) => <option key={protector.id} value={protector.id}>{protector.manufacturer} {protector.model} · {ratingText(protector.nrrDb, protector.snrDb)}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-700">รูปแบบการใช้<select name="configuration" defaultValue="SINGLE" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"><option value="SINGLE">อุปกรณ์ชิ้นเดียว</option><option value="DUAL_UNSUPPORTED">ปลั๊กพร้อมครอบหู (บันทึกได้ แต่ Not evaluable)</option></select></label>
              <label className="block text-xs font-semibold text-slate-700">อุปกรณ์ชิ้นที่สอง (เฉพาะ dual)<select name="secondaryHearingProtectorId" defaultValue="" className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">—</option>{availableProtectors.map((protector) => <option key={protector.id} value={protector.id}>{protector.manufacturer} {protector.model}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-700">วันที่เริ่มมีผล<input name="effectiveFrom" type="date" required defaultValue={defaultEffectiveFrom} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              <label className="block text-xs font-semibold text-slate-700">หมายเหตุ<textarea name="notes" rows={2} className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              <button type="submit" className="hg-interactive hg-pressable w-full bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">บันทึก assignment และ assessment snapshot</button>
            </form>
          </details>
        ) : (
          <p className="mt-4 text-xs text-amber-800">ยังไม่มีอุปกรณ์ที่ Active ใน catalog ของบริษัท</p>
        )
      ) : null}
    </section>
  );
}
