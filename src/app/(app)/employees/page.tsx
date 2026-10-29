import Link from "next/link";
import { Search, SlidersHorizontal, Users } from "lucide-react";
import type {
  ClinicalResultFilter,
  FollowUpWorkflowFilter,
} from "@/application/view-models";
import { legacyEmployeeStatusFilters } from "@/application/employee-status";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  ClinicalResultBadge,
  FollowUpWorkflowBadge,
} from "@/components/ui/status-badge";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import {
  CLINICAL_RESULT_OPTIONS,
  FOLLOW_UP_WORKFLOW_OPTIONS,
} from "@/lib/hearing-labels";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

type SearchParams = Record<string, string | string[] | undefined>;

function validClinicalResult(value?: string): ClinicalResultFilter | undefined {
  return CLINICAL_RESULT_OPTIONS.some((option) => option.value === value)
    ? (value as ClinicalResultFilter)
    : undefined;
}

function validFollowUpWorkflow(value?: string): FollowUpWorkflowFilter | undefined {
  return FOLLOW_UP_WORKFLOW_OPTIONS.some((option) => option.value === value)
    ? (value as FollowUpWorkflowFilter)
    : undefined;
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const query = getSingleQueryValue(raw.q);
  const organizationId = getSingleQueryValue(raw.organization);
  const departmentId = getSingleQueryValue(raw.department);
  const legacyFilters = legacyEmployeeStatusFilters(getSingleQueryValue(raw.status));
  const clinicalResult = validClinicalResult(getSingleQueryValue(raw.clinical))
    ?? legacyFilters.clinicalResult;
  const followUpWorkflow = validFollowUpWorkflow(getSingleQueryValue(raw.workflow))
    ?? legacyFilters.followUpWorkflow;
  const page = Number(getSingleQueryValue(raw.page) ?? 1);
  const result = await getHearGuardReadService().searchEmployees({
    query,
    organizationId,
    departmentId,
    clinicalResult,
    followUpWorkflow,
    page,
  });

  return (
    <>
      <PageHeader
        eyebrow="Employee directory"
        title="พนักงานภายใต้การเฝ้าระวัง"
        description="ค้นหาด้วยรหัสหรือชื่อ แล้วเปิดประวัติการตรวจการได้ยินแบบต่อเนื่องรายบุคคล"
      />

      <section className="hg-table-frame overflow-hidden">
        <form method="get" className="border-b border-[#bcc4bf] bg-[#fafaf7]/75 p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.35fr)_1fr_1fr_1fr_1fr_auto]">
            <label className="relative">
              <span className="sr-only">ค้นหาพนักงาน</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="รหัส ชื่อ หรือนามสกุล"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label>
              <span className="sr-only">สถานประกอบการ</span>
              <select
                name="organization"
                defaultValue={organizationId ?? ""}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">ทุกสถานประกอบการ</option>
                {result.organizations.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">แผนก</span>
              <select
                name="department"
                defaultValue={departmentId ?? ""}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">ทุกแผนก</option>
                {result.departments
                  .filter(
                    (option) =>
                      !organizationId || option.organizationId === organizationId,
                  )
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Clinical result</span>
              <select
                name="clinical"
                defaultValue={clinicalResult ?? ""}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">ทุก Clinical result</option>
                {CLINICAL_RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Follow-up workflow</span>
              <select
                name="workflow"
                defaultValue={followUpWorkflow ?? ""}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">ทุก Follow-up workflow</option>
                {FOLLOW_UP_WORKFLOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="hg-interactive hg-pressable inline-flex h-11 items-center justify-center gap-2 border border-[#202827] bg-[#202827] px-4 text-sm font-semibold text-white hover:bg-[#151b1a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d6c67]"
            >
              <SlidersHorizontal aria-hidden="true" size={17} /> กรอง
            </button>
          </div>
          {query || organizationId || departmentId || clinicalResult || followUpWorkflow ? (
            <div className="mt-3 text-right">
              <Link href="/employees" className="text-xs font-semibold text-teal-700 hover:text-teal-800">
                ล้างตัวกรองทั้งหมด
              </Link>
            </div>
          ) : null}
        </form>

        {result.items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Users aria-hidden="true" className="mx-auto text-slate-300" size={36} />
            <h2 className="mt-4 font-semibold text-slate-900">ไม่พบพนักงาน</h2>
            <p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">พนักงาน</th>
                  <th className="px-5 py-3">สถานประกอบการ / แผนก</th>
                  <th className="px-5 py-3">ตำแหน่ง</th>
                  <th className="px-5 py-3">Audiogram ล่าสุด</th>
                  <th className="px-5 py-3">Clinical result</th>
                  <th className="px-5 py-3">Follow-up workflow</th>
                  <th className="px-5 py-3">สิ่งที่ต้องทำต่อ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((employee) => (
                  <tr key={employee.id} className="group hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <Link
                        href={`/employees/${employee.id}`}
                        className="font-semibold text-slate-950 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600"
                      >
                        {employee.fullName}
                      </Link>
                      <p className="mt-1 font-mono text-[11px] text-slate-500" data-identifier>{employee.employeeNumber}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-800">{employee.organizationName}</p>
                      <p className="mt-1 text-xs text-slate-500">{employee.departmentName ?? "ไม่ระบุแผนก"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{employee.jobTitle ?? "—"}</td>
                    <td className="px-5 py-4 font-mono text-[12px] text-slate-600">{formatDate(employee.latestAudiogramDate)}</td>
                    <td className="px-5 py-4">
                      <ClinicalResultBadge status={employee.latestThaiEvaluationStatus} />
                    </td>
                    <td className="px-5 py-4">
                      <FollowUpWorkflowBadge status={employee.followUpStatus} />
                    </td>
                    <td className="max-w-xs px-5 py-4 text-slate-600">{employee.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pathname="/employees"
          currentQuery={{
            q: query,
            organization: organizationId,
            department: departmentId,
            clinical: clinicalResult,
            workflow: followUpWorkflow,
          }}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </section>
    </>
  );
}
