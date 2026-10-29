import Link from "next/link";
import { AlertTriangle, ClipboardList, Search, SlidersHorizontal } from "lucide-react";
import type { FollowUpQueueFilter } from "@/application/view-models";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EvaluationBadge, WorkflowStageBadge } from "@/components/ui/status-badge";
import { formatDate, getSingleQueryValue } from "@/lib/format";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";

type SearchParams = Record<string, string | string[] | undefined>;

const FILTERS: Array<{ value: FollowUpQueueFilter; label: string }> = [
  { value: "ALL_OPEN", label: "เคสที่เปิดอยู่" },
  { value: "REPEAT_REQUIRED", label: "Repeat required" },
  { value: "OVERDUE", label: "Repeat overdue" },
  { value: "DUE_SOON", label: "Repeat due soon" },
  { value: "PHYSICIAN_REVIEW", label: "Awaiting physician review" },
  { value: "INTERVENTION_REQUIRED", label: "Intervention required" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CLOSED", label: "Closed" },
];

function validFilter(value?: string): FollowUpQueueFilter {
  return FILTERS.some((filter) => filter.value === value)
    ? (value as FollowUpQueueFilter)
    : "ALL_OPEN";
}

function priorityClass(priority: string | null): string {
  if (priority === "URGENT" || priority === "HIGH") {
    return "text-[#a83232]";
  }
  return "text-[#68716e]";
}

export default async function SurveillanceQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const query = getSingleQueryValue(raw.q);
  const organizationId = getSingleQueryValue(raw.organization);
  const filter = validFilter(getSingleQueryValue(raw.filter));
  const page = Number(getSingleQueryValue(raw.page) ?? 1);
  const result = await getHearGuardReadService().searchFollowUpCases({
    query,
    organizationId,
    filter,
    page,
  });

  const summaryCards = [
    { label: "Open cases", value: result.counts.allOpen, filter: "ALL_OPEN" },
    { label: "Repeat required", value: result.counts.repeatRequired, filter: "REPEAT_REQUIRED" },
    { label: "Overdue", value: result.counts.overdue, filter: "OVERDUE" },
    { label: "Awaiting physician review", value: result.counts.physicianReview, filter: "PHYSICIAN_REVIEW" },
    { label: "Intervention", value: result.counts.interventionRequired, filter: "INTERVENTION_REQUIRED" },
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Clinical operations · Work queue"
        title="Surveillance queue"
        description="จัดลำดับเคสที่ต้องดำเนินการ โดยเคสตรวจซ้ำเกินกำหนดจะแสดงก่อนเสมอ"
      />

      <nav aria-label="Queue summary" className="mb-7 grid border-y border-[#bcc4bf] bg-[#fafaf7]/45 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <Link
            key={card.filter}
            href={`/surveillance?filter=${card.filter}${organizationId ? `&organization=${organizationId}` : ""}`}
            className={`hg-interactive hg-pressable relative border-b border-r border-[#d5dad5] px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-[#1d6c67] ${filter === card.filter ? "bg-white text-[#18201e]" : "text-[#68716e] hover:bg-white/60"}`}
          >
            {filter === card.filter ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d6c67]" /> : null}
            <div className="flex items-baseline justify-between gap-3"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">{card.label}</p><p className={`font-mono text-xl font-medium ${card.filter === "OVERDUE" && card.value > 0 ? "text-[#a83232]" : "text-[#18201e]"}`}>{card.value}</p></div>
          </Link>
        ))}
      </nav>

      <section className="hg-table-frame overflow-hidden">
        <form method="get" className="border-b border-[#bcc4bf] bg-[#fafaf7]/75 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(230px,1.4fr)_1fr_1fr_auto]">
            <label className="relative">
              <span className="sr-only">ค้นหาเคส</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="รหัส ชื่อ หรือนามสกุล"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label>
              <span className="sr-only">สถานประกอบการ</span>
              <select name="organization" defaultValue={organizationId ?? ""} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                <option value="">ทุกสถานประกอบการ</option>
                {result.organizations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">ประเภทคิว</span>
              <select name="filter" defaultValue={filter} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="submit" className="hg-interactive hg-pressable inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
              <SlidersHorizontal aria-hidden="true" size={17} /> กรอง
            </button>
          </div>
        </form>

        {result.items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <ClipboardList aria-hidden="true" className="mx-auto text-slate-300" size={36} />
            <h2 className="mt-4 font-semibold text-slate-900">ไม่มีเคสในคิวนี้</h2>
            <p className="mt-1 text-sm text-slate-500">ลองเปลี่ยนตัวกรองหรือคำค้นหา</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Company / Department</th>
                  <th className="px-5 py-3">Clinical result</th>
                  <th className="px-5 py-3">Trigger</th>
                  <th className="px-5 py-3">Detected</th>
                  <th className="px-5 py-3">Due date</th>
                  <th className="px-5 py-3">Workflow stage</th>
                  <th className="px-5 py-3">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((item) => (
                  <tr key={item.id} className={item.isOverdue ? "bg-rose-50/45 hover:bg-rose-50/70" : "hover:bg-slate-50/70"}>
                    <td className="px-5 py-4">
                      <Link href={`/surveillance/${item.id}`} className="font-semibold text-slate-950 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600">{item.employeeName}</Link>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-slate-500">{item.employeeNumber}</span>
                        {item.priority ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span> : null}
                        {item.historicalImport ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">นำเข้าย้อนหลัง</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-slate-800">{item.organizationName}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.departmentName ?? "ไม่ระบุแผนก"}</p>
                    </td>
                    <td className="px-5 py-4">{item.clinicalResult
                      ? <EvaluationBadge status={item.clinicalResult} />
                      : <span className="text-slate-400">—</span>}</td>
                    <td className="max-w-xs px-5 py-4 text-slate-700">
                      <p className="font-medium">{item.trigger}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{item.ruleCode} v{item.ruleVersion}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDate(item.detectedDate)}</td>
                    <td className="px-5 py-4">
                      <span className={item.isOverdue ? "font-semibold text-rose-700" : "text-slate-600"}>{formatDate(item.repeatDueDate)}</span>
                      {item.isOverdue ? <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-700"><AlertTriangle aria-hidden="true" size={13} /> Overdue</span> : null}
                    </td>
                    <td className="px-5 py-4"><WorkflowStageBadge status={item.workflowStage} /></td>
                    <td className="px-5 py-4 text-slate-500">{item.assignedTo ? item.assignedTo.slice(0, 8) : "Unassigned"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pathname="/surveillance"
          currentQuery={{ q: query, organization: organizationId, filter }}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
        />
      </section>
    </>
  );
}
