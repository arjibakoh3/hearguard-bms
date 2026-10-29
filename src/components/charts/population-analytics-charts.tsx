"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DepartmentPopulationSummary,
  OrganizationPopulationSummary,
} from "@/application/view-models";

function PercentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border border-[var(--hg-rule-strong)] bg-[var(--hg-surface-raised)] px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="mt-1 text-slate-600">
          {item.name}: <span className="font-semibold text-slate-900">{item.value?.toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

export function OrganizationComparisonChart({
  organizations,
}: {
  organizations: OrganizationPopulationSummary[];
}) {
  const data = organizations.map((organization) => ({
    name: organization.organizationName,
    completion: organization.audiometryCompletionPct,
    prevalence: organization.shiftPrevalencePct,
  }));
  const height = Math.max(260, data.length * 72);

  return (
    <div
      role="img"
      aria-label="เปรียบเทียบอัตราตรวจ audiometry สำเร็จและ Thai threshold shift prevalence แยกตามสถานประกอบการ"
      style={{ height }}
      className="w-full min-w-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 18, left: 12 }}>
          <CartesianGrid stroke="#cfd5d0" strokeDasharray="2 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: "#64748b", fontSize: 12 }} label={{ value: "ร้อยละ (%)", position: "insideBottom", offset: -12 }} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fill: "#475569", fontSize: 12 }} />
          <Tooltip content={<PercentTooltip />} />
          <Legend verticalAlign="top" height={40} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="completion" name="Annual completion" fill="#1d6c67" radius={0} isAnimationActive={false} />
          <Bar dataKey="prevalence" name="Thai shift prevalence" fill="#a56817" radius={0} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DepartmentPrevalenceChart({
  departments,
}: {
  departments: DepartmentPopulationSummary[];
}) {
  const data = departments.map((department) => ({
    name: department.departmentName,
    prevalence: department.shiftPrevalencePct,
    company: department.organizationShiftPrevalencePct,
  }));
  const height = Math.max(280, data.length * 62);

  return (
    <div
      role="img"
      aria-label="เปรียบเทียบ Thai threshold shift prevalence ของแต่ละแผนกกับค่าเฉลี่ยบริษัท"
      style={{ height }}
      className="w-full min-w-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 18, left: 4 }}>
          <CartesianGrid stroke="#cfd5d0" strokeDasharray="2 3" horizontal={false} />
          <XAxis type="number" domain={[0, "auto"]} unit="%" tick={{ fill: "#64748b", fontSize: 12 }} label={{ value: "Observed prevalence (%)", position: "insideBottom", offset: -12 }} />
          <YAxis type="category" dataKey="name" width={104} tick={{ fill: "#475569", fontSize: 12 }} />
          <Tooltip content={<PercentTooltip />} />
          <Legend verticalAlign="top" height={40} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="prevalence" name="Department prevalence" fill="#a56817" radius={0} isAnimationActive={false} />
          <Bar dataKey="company" name="Company average" fill="#8c9692" radius={0} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
