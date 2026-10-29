import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft,
  AudioLines,
  CalendarCheck2,
  ClipboardList,
  Gauge,
  Network,
  TriangleAlert,
  Users,
  Volume2,
  Headphones,
} from "lucide-react";
import { DepartmentPrevalenceChart } from "@/components/charts/population-analytics-charts";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  ClinicalResultBadge,
  FollowUpWorkflowBadge,
} from "@/components/ui/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const service = getHearGuardReadService();
  const [organization, analytics] = await Promise.all([
    service.getOrganization(id),
    service.getOrganizationAnalytics(id),
  ]);
  if (!organization || !analytics) notFound();
  const summary = analytics.summary;

  return (
    <>
      <Link href="/companies" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
        <ArrowLeft aria-hidden="true" size={16} /> กลับไปสถานประกอบการ
      </Link>
      <PageHeader
        eyebrow={`${organization.code} · Analytics ${summary.surveillanceYear}`}
        title={organization.name}
        description={organization.nameTh ?? "Company-level hearing surveillance analytics"}
        actions={<div className="flex flex-wrap gap-2"><Link href={`/companies/${organization.id}/hearing-protection`} className="hg-interactive hg-pressable inline-flex items-center justify-center gap-2 border border-teal-700 bg-white px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-50"><Headphones size={17} /> Hearing protection</Link><Link href={`/employees?organization=${organization.id}`} className="hg-interactive hg-pressable inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">ดูพนักงานทั้งหมด</Link></div>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Employees" value={formatNumber(summary.workersUnderSurveillance)} detail={`${organization.departmentCount} แผนก`} icon={Users} />
        <MetricCard label="Noise exposure linked" value={formatNumber(summary.workersWithNoiseExposure)} detail="เชื่อมข้อมูลระดับบุคคลหรือแผนก" icon={Volume2} />
        <MetricCard label="Annual completion" value={`${summary.audiometryCompletionPct.toFixed(1)}%`} detail={`${summary.audiogramsCompleted}/${summary.workersUnderSurveillance} คน`} icon={CalendarCheck2} />
        <MetricCard label="Thai threshold shifts" value={formatNumber(summary.thresholdShifts)} detail={`${summary.shiftPrevalencePct.toFixed(1)}% ของ ${summary.evaluableWorkers} คนที่ evaluable`} icon={AudioLines} />
        <MetricCard label="Outstanding follow-up" value={formatNumber(summary.outstandingFollowUp)} detail={`${summary.repeatOverdue} เคส overdue`} icon={ClipboardList} />
        <MetricCard label="Not evaluable" value={formatNumber(summary.notEvaluableWorkers)} detail="ต้องตรวจ baseline หรือความครบถ้วน" icon={TriangleAlert} />
      </div>

      <div className="mt-7 grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <section className="min-w-0 border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)] p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-950">Department prevalence comparison</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Observed Thai shift prevalence เทียบกับค่าเฉลี่ยบริษัท ไม่ใช่การสรุปสาเหตุของโรค</p>
          </div>
          <DepartmentPrevalenceChart departments={analytics.departments} />
        </section>

        <section className="border-y border-[var(--hg-rule-strong)] bg-[var(--hg-surface)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-950">Surveillance burden heatmap</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">สีเน้นเฉพาะแผนกที่ prevalence สูงกว่าค่าเฉลี่ยบริษัท พร้อมแสดงค่าจริงเสมอ</p>
          </div>
          <div className="space-y-4 p-5">
            {analytics.departments.map((department) => (
              <Link key={department.departmentId} href={`/companies/${organization.id}/departments/${department.departmentId}`} className={`hg-surface-interactive block rounded-lg border p-3.5 hover:border-teal-300 ${department.potentialDeteriorationCluster ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div><p className="font-semibold text-slate-900">{department.departmentName}</p><p className="mt-1 text-xs text-slate-500">{department.thresholdShifts}/{department.evaluableWorkers} evaluable workers · {department.outstandingFollowUp} open cases</p></div>
                  <div className="text-right"><p className={`font-semibold ${department.potentialDeteriorationCluster ? "text-amber-700" : "text-slate-700"}`}>{department.shiftPrevalencePct.toFixed(1)}%</p>{department.potentialDeteriorationCluster ? <p className="mt-1 text-[10px] font-semibold uppercase text-amber-700">Above company average</p> : null}</div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden bg-slate-200" aria-hidden="true"><div className={`h-full ${department.potentialDeteriorationCluster ? "bg-[var(--hg-review)]" : "bg-[var(--hg-petrol)]"}`} style={{ width: `${department.shiftPrevalencePct}%` }} /></div>
              </Link>
            ))}
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500">Potential hearing deterioration cluster = observed prevalence สูงกว่าค่าเฉลี่ยบริษัท ไม่ใช่ predictive risk score หรือการวินิจฉัย NIHL</p>
        </section>
      </div>

      <section className="hg-table-frame mt-7 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2"><Network aria-hidden="true" className="text-teal-700" size={19} /><h2 className="font-semibold text-slate-950">Department analytics</h2></div>
          <p className="mt-1 text-sm text-slate-500">Organization → Department → Employee</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Department</th><th className="px-5 py-3">Workers</th><th className="px-5 py-3">Completed</th><th className="px-5 py-3">Thai shifts</th><th className="px-5 py-3">Prevalence</th><th className="px-5 py-3">Open follow-up</th><th className="px-5 py-3">Latest TWA</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.departments.map((department) => {
                const exposure = organization.departments.find((item) => item.id === department.departmentId);
                return (
                  <tr key={department.departmentId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4"><Link href={`/companies/${organization.id}/departments/${department.departmentId}`} className="font-semibold text-slate-950 hover:text-teal-700">{department.departmentName}</Link><p className="mt-1 text-xs text-slate-500">{department.departmentCode}</p></td>
                    <td className="px-5 py-4 text-slate-700">{formatNumber(department.workersUnderSurveillance)}</td>
                    <td className="px-5 py-4 text-slate-700">{department.audiogramsCompleted} <span className="text-xs text-slate-400">({department.audiometryCompletionPct.toFixed(1)}%)</span></td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{department.thresholdShifts}</td>
                    <td className="px-5 py-4"><span className={department.potentialDeteriorationCluster ? "font-semibold text-amber-700" : "font-medium text-slate-700"}>{department.shiftPrevalencePct.toFixed(1)}%</span></td>
                    <td className="px-5 py-4 text-slate-700">{department.outstandingFollowUp}</td>
                    <td className="px-5 py-4">{exposure?.latestTwaDbA === null || exposure?.latestTwaDbA === undefined ? <span className="text-slate-400">ไม่มีข้อมูล</span> : <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800"><Gauge aria-hidden="true" className="text-amber-600" size={16} />{exposure.latestTwaDbA.toFixed(1)} dB(A)</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hg-table-frame mt-7 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">ตัวอย่างพนักงาน</h2><p className="mt-1 text-sm text-slate-500">เปิด longitudinal hearing profile รายบุคคล</p></div><Link href={`/employees?organization=${organization.id}`} className="text-sm font-semibold text-teal-700 hover:text-teal-800">ดูทั้งหมด</Link></div>
        <div className="divide-y divide-slate-100">
          {organization.recentEmployees.map((employee) => (
            <Link key={employee.id} href={`/employees/${employee.id}`} className="flex flex-col gap-3 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{employee.fullName}</p><p className="mt-1 text-xs text-slate-500">{employee.employeeNumber} · {employee.departmentName ?? "ไม่ระบุแผนก"} · Audiogram {formatDate(employee.latestAudiogramDate)}</p></div><div className="flex flex-wrap gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Clinical result</p><ClinicalResultBadge status={employee.latestThaiEvaluationStatus} /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Follow-up workflow</p><FollowUpWorkflowBadge status={employee.followUpStatus} /></div></div></Link>
          ))}
        </div>
      </section>
    </>
  );
}
