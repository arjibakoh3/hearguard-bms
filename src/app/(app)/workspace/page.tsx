import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Building2,
  CalendarCheck2,
  ClipboardList,
  Stethoscope,
  TriangleAlert,
  Users,
} from "lucide-react";
import { OrganizationComparisonChart } from "@/components/charts/population-analytics-charts";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatNumber } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const service = getHearGuardReadService();
  const dashboard = await service.getPopulationDashboard();
  const { totals } = dashboard;

  return (
    <>
      <PageHeader
        eyebrow={`Surveillance register · ${totals.surveillanceYear}`}
        title="ภาพรวมการเฝ้าระวังการได้ยิน"
        description="มองเห็นสิ่งที่ต้องดำเนินการตอนนี้ แล้วเจาะจากสถานประกอบการลงสู่แผนกและพนักงาน"
        actions={
          <Link href="/surveillance" className="hg-interactive hg-pressable inline-flex items-center justify-center gap-2 border border-[#1d6c67] bg-[#1d6c67] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#15534f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d6c67]">
            เปิด work queue <ArrowRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      {query.denied === "manage" ? (
        <section className="mb-6 border-l-2 border-[#315f9e] bg-white/45 px-5 py-4 text-sm leading-6 text-[#315f7d]">
          บัญชีนี้เป็นสิทธิ์อ่านอย่างเดียว จึงเปิดดูข้อมูลขององค์กรที่ได้รับอนุญาตได้ แต่ไม่สามารถนำเข้าข้อมูลหรือเปลี่ยนสถานะ workflow ได้
        </section>
      ) : null}

      <section className="mb-7 border-y border-[#d9c28c] bg-[#f7eedb]/60 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-[#a56817]" size={19} strokeWidth={1.7} />
            <div>
              <p className="hg-technical-label text-[#8a5715]">Action required</p>
              <h2 className="mt-1 font-semibold text-[#4c3518]">สิ่งที่ต้องดำเนินการตอนนี้</h2>
              <p className="mt-1 text-sm leading-6 text-[#76551f]">จัดการเคสตรวจซ้ำเกินกำหนดก่อน แล้วติดตามเคสที่รอแพทย์ทบทวน</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/surveillance?filter=OVERDUE" className="border-b-2 border-[#a83232] px-1 py-2 text-sm font-semibold text-[#a83232] hover:bg-white/50">
              <span className="font-mono">{formatNumber(totals.repeatOverdue)}</span> overdue
            </Link>
            <Link href="/surveillance?filter=PHYSICIAN_REVIEW" className="border-b-2 border-[#66517f] px-1 py-2 text-sm font-semibold text-[#66517f] hover:bg-white/50">
              <span className="font-mono">{formatNumber(totals.awaitingPhysicianReview)}</span> รอแพทย์
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-y-5 border-y border-[#bcc4bf] bg-[#fafaf7]/50 px-4 py-4 sm:grid-cols-2 sm:px-0 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Workers under surveillance" value={formatNumber(totals.workersUnderSurveillance)} detail={`${formatNumber(totals.workersWithNoiseExposure)} คนเชื่อมข้อมูลสัมผัสเสียง`} icon={Users} />
        <MetricCard label="Audiograms this year" value={formatNumber(totals.audiogramsCompleted)} detail={`${totals.audiometryCompletionPct.toFixed(1)}% completion`} icon={CalendarCheck2} />
        <MetricCard label="Threshold shifts" value={formatNumber(totals.thresholdShifts)} detail={`${totals.shiftPrevalencePct.toFixed(1)}% ของผล Thai ที่ evaluable`} icon={AudioLines} />
        <MetricCard label="Awaiting repeat" value={formatNumber(totals.awaitingRepeat)} detail={`${totals.repeatOverdue} เคส overdue`} icon={ClipboardList} />
        <MetricCard label="Awaiting physician review" value={formatNumber(totals.awaitingPhysicianReview)} detail="ตรวจซ้ำแล้วหรืออยู่ระหว่าง review" icon={Stethoscope} />
        <MetricCard label="Cases closed" value={formatNumber(totals.casesClosed)} detail={`${totals.outstandingFollowUp} เคสยังเปิดอยู่`} icon={Building2} />
      </div>

      <div className="mt-9 grid gap-9 2xl:grid-cols-[1.25fr_0.75fr]">
        <section className="min-w-0 border-t border-[#bcc4bf] pt-5">
          <div className="mb-4">
            <p className="hg-technical-label">01 · Population comparison</p>
            <h2 className="mt-1 font-semibold text-[#18201e]">Company-level surveillance status</h2>
            <p className="mt-1 text-sm leading-6 text-[#68716e]">เปรียบเทียบ annual completion กับ Thai shift prevalence โดยใช้สเกลร้อยละเดียวกัน</p>
          </div>
          <OrganizationComparisonChart organizations={dashboard.organizations} />
        </section>

        <section className="border-t border-[#bcc4bf] pt-5">
          <div className="border-b border-[#d5dad5] pb-4">
            <p className="hg-technical-label">02 · Observed signal</p>
            <h2 className="mt-1 font-semibold text-[#18201e]">Potential hearing deterioration cluster</h2>
            <p className="mt-1 text-sm leading-6 text-[#68716e]">แผนกที่ observed prevalence สูงกว่าค่าเฉลี่ยบริษัท ไม่ใช่ข้อสรุปเชิงสาเหตุ</p>
          </div>
          {dashboard.attentionDepartments.length === 0 ? (
            <p className="py-8 text-sm text-[#68716e]">ไม่พบแผนกที่สูงกว่าค่าเฉลี่ยบริษัทในข้อมูลปีนี้</p>
          ) : (
            <div className="divide-y divide-[#d5dad5]">
              {dashboard.attentionDepartments.map((department) => (
                <Link key={department.departmentId} href={`/companies/${department.organizationId}/departments/${department.departmentId}`} className="flex items-center justify-between gap-4 py-4 hover:bg-white/45">
                  <div>
                    <p className="font-semibold text-slate-900">{department.departmentName}</p>
                    <p className="mt-1 text-xs text-slate-500">{department.organizationName} · {department.thresholdShifts}/{department.evaluableWorkers} evaluable workers</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-700">{department.shiftPrevalencePct.toFixed(1)}%</p>
                    <p className="mt-1 text-[11px] text-slate-400">บริษัท {department.organizationShiftPrevalencePct.toFixed(1)}%</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="hg-table-frame mt-9 overflow-hidden">
        <div className="border-b border-[#bcc4bf] px-5 py-4">
          <p className="hg-technical-label">03 · Organization register</p>
          <h2 className="mt-1 font-semibold text-[#18201e]">สถานประกอบการทั้งหมด</h2>
          <p className="mt-1 text-sm text-[#68716e]">กดเพื่อดู department heatmap และ drill-down</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Company</th><th className="px-5 py-3">Workers</th><th className="px-5 py-3">Completed</th><th className="px-5 py-3">Thai shifts</th><th className="px-5 py-3">Prevalence</th><th className="px-5 py-3">Outstanding</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.organizations.map((organization) => (
                <tr key={organization.organizationId} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><Link href={`/companies/${organization.organizationId}`} className="font-semibold text-slate-950 hover:text-teal-700">{organization.organizationName}</Link><p className="mt-1 text-xs text-slate-500">{organization.organizationCode}</p></td>
                  <td className="px-5 py-4 text-slate-700">{formatNumber(organization.workersUnderSurveillance)}</td>
                  <td className="px-5 py-4 text-slate-700">{formatNumber(organization.audiogramsCompleted)} <span className="text-xs text-slate-400">({organization.audiometryCompletionPct.toFixed(1)}%)</span></td>
                  <td className="px-5 py-4 font-semibold text-slate-800">{formatNumber(organization.thresholdShifts)}</td>
                  <td className="px-5 py-4 font-semibold text-amber-700">{organization.shiftPrevalencePct.toFixed(1)}%</td>
                  <td className="px-5 py-4 text-slate-700">{formatNumber(organization.outstandingFollowUp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
