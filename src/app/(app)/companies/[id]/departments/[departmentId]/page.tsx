import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft,
  AudioLines,
  CalendarCheck2,
  ClipboardList,
  TriangleAlert,
  Users,
  Volume2,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  ClinicalResultBadge,
  FollowUpWorkflowBadge,
} from "@/components/ui/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

export default async function DepartmentAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string; departmentId: string }>;
}) {
  const { id, departmentId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(departmentId).success) notFound();

  const service = getHearGuardReadService();
  const [summary, employees] = await Promise.all([
    service.getDepartmentAnalytics(id, departmentId),
    service.searchEmployees({
      organizationId: id,
      departmentId,
      page: 1,
      pageSize: 50,
    }),
  ]);
  if (!summary) notFound();
  const relativeWidth = Math.min(
    100,
    summary.organizationShiftPrevalencePct === 0
      ? summary.shiftPrevalencePct === 0
        ? 0
        : 100
      : (summary.shiftPrevalencePct /
          Math.max(
            summary.shiftPrevalencePct,
            summary.organizationShiftPrevalencePct,
          )) *
          100,
  );
  const companyWidth = Math.min(
    100,
    summary.shiftPrevalencePct === 0 &&
      summary.organizationShiftPrevalencePct === 0
      ? 0
      : (summary.organizationShiftPrevalencePct /
          Math.max(
            summary.shiftPrevalencePct,
            summary.organizationShiftPrevalencePct,
          )) *
          100,
  );

  return (
    <>
      <Link href={`/companies/${id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
        <ArrowLeft aria-hidden="true" size={16} /> กลับไป {summary.organizationName}
      </Link>
      <PageHeader
        eyebrow={`${summary.organizationCode} · ${summary.departmentCode} · ${summary.surveillanceYear}`}
        title={summary.departmentName}
        description="Department-level hearing surveillance analytics และรายชื่อพนักงานสำหรับ drill-down"
        actions={<Link href={`/employees?organization=${id}&department=${departmentId}`} className="hg-interactive hg-pressable inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">ดูใน Employee directory</Link>}
      />

      {summary.potentialDeteriorationCluster ? (
        <section className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
          <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={20} />
          <div><h2 className="font-semibold">Potential hearing deterioration cluster</h2><p className="mt-1 text-sm leading-6">Observed prevalence ของแผนกสูงกว่าค่าเฉลี่ยบริษัท ควรทบทวนข้อมูลรายบุคคลและบริบทการสัมผัสเสียง แต่ยังไม่ใช่ข้อสรุปว่าเกิดจากงานหรือเสียงดัง</p></div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Workers" value={formatNumber(summary.workersUnderSurveillance)} detail="พนักงาน active ในแผนก" icon={Users} />
        <MetricCard label="Noise exposure linked" value={formatNumber(summary.workersWithNoiseExposure)} detail="ข้อมูลระดับบุคคลหรือแผนก" icon={Volume2} />
        <MetricCard label="Annual completion" value={`${summary.audiometryCompletionPct.toFixed(1)}%`} detail={`${summary.audiogramsCompleted}/${summary.workersUnderSurveillance} คน`} icon={CalendarCheck2} />
        <MetricCard label="Thai shifts" value={formatNumber(summary.thresholdShifts)} detail={`${summary.evaluableWorkers} คน evaluable`} icon={AudioLines} />
        <MetricCard label="Shift prevalence" value={`${summary.shiftPrevalencePct.toFixed(1)}%`} detail={`บริษัท ${summary.organizationShiftPrevalencePct.toFixed(1)}%`} icon={TriangleAlert} />
        <MetricCard label="Open follow-up" value={formatNumber(summary.outstandingFollowUp)} detail={`${summary.repeatOverdue} เคส overdue`} icon={ClipboardList} />
      </div>

      <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold text-slate-950">Observed prevalence comparison</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">สัดส่วนจากผล Thai ที่ evaluable เท่านั้น ไม่รวม Not evaluable ในตัวหาร</p>
        <div className="mt-5 space-y-4" role="img" aria-label={`แผนก ${summary.shiftPrevalencePct.toFixed(1)} เปอร์เซ็นต์ เทียบกับค่าเฉลี่ยบริษัท ${summary.organizationShiftPrevalencePct.toFixed(1)} เปอร์เซ็นต์`}>
          <div>
            <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-semibold text-slate-800">{summary.departmentName}</span><span className="font-semibold text-amber-700">{summary.shiftPrevalencePct.toFixed(1)}%</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${relativeWidth}%` }} /></div>
          </div>
          <div>
            <div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="font-medium text-slate-600">Company average</span><span className="font-medium text-slate-600">{summary.organizationShiftPrevalencePct.toFixed(1)}%</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${companyWidth}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">พนักงานในแผนก</h2><p className="mt-1 text-sm text-slate-500">เปิดรายบุคคลเพื่อตรวจ audiogram, exact finding และ follow-up</p></div><span className="text-xs font-semibold text-slate-500">{employees.total} คน</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Job title</th><th className="px-5 py-3">Latest audiogram</th><th className="px-5 py-3">Clinical result</th><th className="px-5 py-3">Follow-up workflow</th><th className="px-5 py-3">Next action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {employees.items.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><Link href={`/employees/${employee.id}`} className="font-semibold text-slate-950 hover:text-teal-700">{employee.fullName}</Link><p className="mt-1 text-xs text-slate-500">{employee.employeeNumber}</p></td>
                  <td className="px-5 py-4 text-slate-600">{employee.jobTitle ?? "—"}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(employee.latestAudiogramDate)}</td>
                  <td className="px-5 py-4"><ClinicalResultBadge status={employee.latestThaiEvaluationStatus} /></td>
                  <td className="px-5 py-4"><FollowUpWorkflowBadge status={employee.followUpStatus} /></td>
                  <td className="max-w-xs px-5 py-4 text-slate-600">{employee.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
