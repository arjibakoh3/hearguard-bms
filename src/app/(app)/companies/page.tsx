import Link from "next/link";
import { ArrowRight, ArrowRightLeft, Building2, CalendarDays, Network, Plus, Users } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber, getSingleQueryValue } from "@/lib/format";
import { requireCurrentActor } from "@/lib/server/current-actor";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const service = getHearGuardReadService();
  const [actor, organizations, dashboard, raw] = await Promise.all([
    requireCurrentActor(),
    service.listOrganizations(),
    service.getPopulationDashboard(),
    searchParams,
  ]);
  const employeeTotal = organizations.reduce(
    (total, organization) => total + organization.activeEmployeeCount,
    0,
  );
  const departmentTotal = organizations.reduce(
    (total, organization) => total + organization.departmentCount,
    0,
  );
  const analyticsByOrganization = new Map(
    dashboard.organizations.map((item) => [item.organizationId, item]),
  );

  return (
    <>
      <PageHeader
        eyebrow={`Organization register · ${dashboard.totals.surveillanceYear}`}
        title="สถานประกอบการ"
        description="โครงสร้างองค์กรที่อยู่ภายใต้การเฝ้าระวัง แยกข้อมูลตามบริษัทและแผนกตั้งแต่ระดับฐานข้อมูล"
        actions={actor.role === "HOSPITAL_ADMIN" ? <div className="flex flex-wrap gap-2"><Link href="/companies/employment-transfers" className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowRightLeft aria-hidden="true" size={17} /> รายการย้ายบริษัท</Link><Link href="/companies/new" className="hg-interactive hg-pressable inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Plus aria-hidden="true" size={17} /> เพิ่มบริษัท</Link></div> : undefined}
      />

      {getSingleQueryValue(raw.denied) === "admin" ? <div className="mb-5 border-l-2 border-[var(--hg-review)] bg-[var(--hg-review-soft)] px-5 py-4 text-sm text-[#6d4915]">เฉพาะ Hospital Admin เท่านั้นที่เพิ่มบริษัทหรืออนุมัติการย้ายบริษัทข้ามขอบเขตสิทธิ์ได้</div> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="สถานประกอบการ"
          value={formatNumber(organizations.length)}
          icon={Building2}
        />
        <MetricCard
          label="แผนกที่ใช้งาน"
          value={formatNumber(departmentTotal)}
          icon={Network}
        />
        <MetricCard
          label="พนักงานที่ใช้งาน"
          value={formatNumber(employeeTotal)}
          icon={Users}
        />
      </div>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            รายชื่อสถานประกอบการทั้งหมด
          </h2>
          <span className="text-xs text-slate-500">
            ข้อมูลสังเคราะห์ {organizations.length} แห่ง
          </span>
        </div>
        <div className="border-y border-[var(--hg-rule-strong)]">
          {organizations.map((organization) => {
            const analytics = analyticsByOrganization.get(organization.id);
            return (
            <Link
              key={organization.id}
              href={`/companies/${organization.id}`}
              className="hg-surface-interactive group grid gap-4 border-b border-[var(--hg-rule)] bg-[var(--hg-surface)] px-4 py-5 last:border-b-0 hover:bg-[var(--hg-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hg-petrol)] lg:grid-cols-[minmax(15rem,1.25fr)_minmax(24rem,1fr)_auto] lg:items-center"
            >
              <div className="flex items-start gap-4">
                <span className="hg-mono mt-0.5 text-[10px] text-[var(--hg-petrol)]">ORG</span>
                <div><h2 className="text-base font-semibold tracking-tight text-[var(--hg-ink)]">{organization.name}</h2><p className="mt-1 text-sm text-[var(--hg-muted)]">{organization.nameTh ?? organization.code}</p><span className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--hg-muted)]"><span className="size-1.5 bg-[var(--hg-petrol)]" />Active</span></div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-l border-[var(--hg-rule)] pl-4">
                <div>
                  <dt className="text-xs text-slate-500">พนักงาน</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {formatNumber(organization.activeEmployeeCount)} คน
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Annual completion</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {analytics?.audiometryCompletionPct.toFixed(1) ?? "0.0"}%
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Thai shift prevalence</dt>
                  <dd className="mt-1 font-semibold text-amber-700">
                    {analytics?.shiftPrevalencePct.toFixed(1) ?? "0.0"}%
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Open follow-up</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {formatNumber(analytics?.outstandingFollowUp ?? 0)} เคส
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-3 text-xs text-[var(--hg-muted)] lg:flex-col lg:items-end">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden="true" size={15} />
                  Audiogram ล่าสุด {formatDate(organization.latestAudiogramDate)}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="text-[var(--hg-petrol)]"
                  size={17}
                />
              </div>
            </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
