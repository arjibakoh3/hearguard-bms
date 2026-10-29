"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Activity, AlertTriangle, ChevronDown, ClipboardCheck, Ear, Save, Stethoscope, UserRound } from "lucide-react";
import Link from "next/link";
import type {
  HospitalPatientEmploymentSummary,
  ImportantHearingCondition,
  PaperlessAudiogramInput,
  PaperlessHistoryQuestionCode,
  PaperlessHistoryResponse,
  PaperlessWorkspace,
  PriorHistorySnapshot,
  QuickHistoryState,
} from "@/application/paperless-audiometry-models";
import {
  applyQuickHistoryState,
  createBlankHistoryResponses,
  getQuickHistoryState,
  IMPORTANT_HEARING_HISTORY_CATEGORIES,
  PAPERLESS_ALWAYS_ASK_HISTORY_CODES,
  PAPERLESS_EAR_RELATED_HISTORY_CODES,
  PAPERLESS_HISTORY_GROUPS,
  PAPERLESS_HISTORY_QUESTIONS,
  setQuickHistoryFinding,
  setThresholdNumericValue,
  toggleThresholdNoResponse,
} from "@/application/paperless-audiometry-models";
import {
  assessNioshConfirmationEvidence,
  type AudiogramThresholdObservation,
  type Ear as EarSide,
  type FrequencyHz,
  type NioshConfirmationEvidenceAssessment,
} from "@/domain/hearing";
import {
  loadPriorHistorySnapshot,
  loadImportantHearingHistory,
  lookupHospitalPatientEmployments,
  savePaperlessAudiogram,
  type PaperlessActionState,
} from "@/app/(app)/paperless-audiometry/actions";

const initialActionState: PaperlessActionState = { error: null };
const frequencies = [500, 1000, 2000, 3000, 4000, 6000, 8000] as const;

type NewEmployee = {
  hospitalNumber: string;
  departmentId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  sex: string;
  dateOfBirth: string;
  jobTitle: string;
  employmentStartDate: string;
  transitionMode: "TRANSFER" | "CONCURRENT" | "";
  effectiveDate: string;
  priorEmployeeId: string;
};

const blankNewEmployee: NewEmployee = {
  hospitalNumber: "",
  departmentId: "",
  employeeNumber: "",
  firstName: "",
  lastName: "",
  sex: "",
  dateOfBirth: "",
  jobTitle: "",
  employmentStartDate: "",
  transitionMode: "",
  effectiveDate: "",
  priorEmployeeId: "",
};

function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function thresholdKey(ear: EarSide, frequencyHz: FrequencyHz): string {
  return `${ear}:${frequencyHz}`;
}

function AudiogramPreview({ observations }: { observations: AudiogramThresholdObservation[] }) {
  const width = 620;
  const height = 260;
  const left = 52;
  const top = 18;
  const plotWidth = width - left - 22;
  const plotHeight = height - top - 38;
  const x = (index: number) => left + (plotWidth * index) / (frequencies.length - 1);
  const y = (value: number) => top + ((value + 20) / 160) * plotHeight;
  const points = (ear: EarSide) => observations
    .filter((item): item is Extract<AudiogramThresholdObservation, { responseStatus: "MEASURED" }> =>
      item.ear === ear && item.responseStatus === "MEASURED")
    .sort((a, b) => a.frequencyHz - b.frequencyHz)
    .map((item) => `${x(frequencies.indexOf(item.frequencyHz))},${y(item.thresholdDbHl)}`)
    .join(" ");

  return (
    <div className="overflow-x-auto border-y border-[#bcc4bf] bg-[#fafaf7]/55 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[560px]" role="img" aria-label="Audiogram preview">
        {[-20, 0, 20, 40, 60, 80, 100, 120, 140].map((value) => (
          <g key={value}>
            <line x1={left} x2={width - 22} y1={y(value)} y2={y(value)} stroke="#e2e8f0" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="10" fill="#64748b">{value}</text>
          </g>
        ))}
        {frequencies.map((frequency, index) => (
          <g key={frequency}>
            <line x1={x(index)} x2={x(index)} y1={top} y2={top + plotHeight} stroke="#f1f5f9" />
            <text x={x(index)} y={height - 12} textAnchor="middle" fontSize="10" fill="#64748b">{frequency}</text>
          </g>
        ))}
        <polyline points={points("LEFT")} fill="none" stroke="#2563eb" strokeWidth="2.5" />
        <polyline points={points("RIGHT")} fill="none" stroke="#dc2626" strokeWidth="2.5" />
        <text x={left} y="12" fontSize="10" fill="#2563eb">Left ×</text>
        <text x={left + 54} y="12" fontSize="10" fill="#dc2626">Right ○</text>
      </svg>
    </div>
  );
}

export function PaperlessAudiometryForm({
  workspace,
  initial,
  draftId,
  canCreateOrganization,
}: {
  workspace: PaperlessWorkspace;
  initial: PaperlessAudiogramInput;
  draftId: string | null;
  canCreateOrganization: boolean;
}) {
  const [state, action, pending] = useActionState(savePaperlessAudiogram, initialActionState);
  const [input, setInput] = useState(initial);
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [newEmployee, setNewEmployee] = useState(blankNewEmployee);
  const [priorHistory, setPriorHistory] = useState<PriorHistorySnapshot | null>(null);
  const [historyEditorVisible, setHistoryEditorVisible] = useState(
    initial.pretest.historyCaptureMode !== "UNCHANGED_FROM_PRIOR",
  );
  const [importantHistoryEditorVisible, setImportantHistoryEditorVisible] = useState(
    initial.importantHistory.captureMode === "UPDATED_CURRENT",
  );
  const [additionalDetailsVisible, setAdditionalDetailsVisible] = useState(false);
  const [priorHistoryLoading, startPriorHistoryTransition] = useTransition();
  const [patientEmploymentSummary, setPatientEmploymentSummary] = useState<HospitalPatientEmploymentSummary | null>(null);
  const [patientLookupPending, startPatientLookupTransition] = useTransition();
  const matchingEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase("th-TH");
    return workspace.employees.filter((employee) => (
      !input.organizationId || employee.organizationId === input.organizationId
    ) && (!query || `${employee.hospitalNumber} ${employee.employeeNumber} ${employee.fullName}`
      .toLocaleLowerCase("th-TH").includes(query)));
  }, [employeeSearch, input.organizationId, workspace.employees]);
  const sequences = workspace.sequences.filter((item) => item.employeeId === input.employeeId);
  const selectedEmployee = workspace.employees.find((item) => item.id === input.employeeId);
  const departments = workspace.departments.filter((item) => item.organizationId === input.organizationId);
  const activeAudiometers = workspace.audiometers.filter((item) => item.active);
  const availableExaminers = workspace.examiners.filter((item) =>
    item.global || item.organizationIds.includes(input.organizationId));
  const selectedAudiometer = workspace.audiometers.find((item) => item.id === input.audiometerId) ?? null;
  const calibrationStatus = useMemo(() => {
    if (!selectedAudiometer?.calibrationDate) return "UNKNOWN" as const;
    const calibration = new Date(`${selectedAudiometer.calibrationDate}T00:00:00`);
    const examined = new Date(input.examinedAt);
    if (calibration > examined) return "UNKNOWN" as const;
    const anniversary = new Date(calibration);
    anniversary.setFullYear(anniversary.getFullYear() + 1);
    return anniversary < examined ? "OVERDUE" as const : "CURRENT" as const;
  }, [input.examinedAt, selectedAudiometer]);
  const requiresDocumentedQuietPeriod = input.examType === "BASELINE" || input.examType === "CONFIRMATION";
  const availableExamOptions = initial.examType === "REPEAT"
    ? [...creatableExamOptions.slice(0, 2), legacyRepeatOption, ...creatableExamOptions.slice(2)]
    : creatableExamOptions;
  const nioshConfirmationEvidence = useMemo(
    () => input.examType === "CONFIRMATION"
      ? assessNioshConfirmationEvidence({
          quietPeriodAnswer: input.pretest.quietPeriodAnswer,
          quietPeriodHours: input.pretest.quietPeriodHours,
          highNonoccupationalNoise: input.pretest.highNonoccupationalNoise,
          hearingProtectionUsedAsSubstitute: input.pretest.hearingProtectionDuringQuiet,
        })
      : null,
    [input.examType, input.pretest],
  );
  const activeImportantHistory = input.importantHistory.conditions.filter((item) => item.status === "ACTIVE");
  const quickHistoryState = useMemo(
    () => getQuickHistoryState(input.historyResponses),
    [input.historyResponses],
  );
  const thresholdCounts = useMemo(() => input.thresholds.reduce((counts, item) => ({
    ...counts,
    [item.responseStatus]: counts[item.responseStatus] + 1,
  }), { MEASURED: 0, NO_RESPONSE: 0, NOT_TESTED: 0 }), [input.thresholds]);

  useEffect(() => {
    if (patientMode !== "existing" || !input.employeeId
      || !["ANNUAL", "REPEAT", "CONFIRMATION"].includes(input.examType)
      || ((input.examType === "REPEAT" || input.examType === "CONFIRMATION")
        && !input.sourceMonitoringAudiogramId)) {
      return;
    }
    let current = true;
    startPriorHistoryTransition(async () => {
      try {
        const snapshot = await loadPriorHistorySnapshot({
          employeeId: input.employeeId,
          examType: input.examType,
          sourceMonitoringAudiogramId: input.sourceMonitoringAudiogramId,
          examinedAt: input.examinedAt,
        });
        if (current) setPriorHistory(snapshot);
      } catch {
        if (current) setPriorHistory(null);
      }
    });
    return () => { current = false; };
  }, [input.employeeId, input.examType, input.examinedAt, input.sourceMonitoringAudiogramId, patientMode]);

  useEffect(() => {
    if (patientMode !== "existing" || !input.employeeId || draftId) return;
    let current = true;
    startPriorHistoryTransition(async () => {
      try {
        const history = await loadImportantHearingHistory(input.employeeId);
        if (!current || !history) return;
        setInput((value) => ({
          ...value,
          importantHistory: {
            captureMode: "CONFIRMED_CURRENT",
            sourceAudiogramId: null,
            conditions: history.conditions,
          },
        }));
        setImportantHistoryEditorVisible(false);
      } catch {
        if (current) {
          setInput((value) => ({ ...value, importantHistory: { captureMode: "UPDATED_CURRENT", sourceAudiogramId: null, conditions: [] } }));
          setImportantHistoryEditorVisible(true);
        }
      }
    });
    return () => { current = false; };
  }, [draftId, input.employeeId, patientMode]);

  useEffect(() => {
    if (patientMode !== "new" || !/^\d{7}$/.test(newEmployee.hospitalNumber)) return;
    let current = true;
    startPatientLookupTransition(async () => {
      try {
        const summary = await lookupHospitalPatientEmployments(newEmployee.hospitalNumber);
        if (current) setPatientEmploymentSummary(summary);
      } catch {
        if (current) setPatientEmploymentSummary(null);
      }
    });
    return () => { current = false; };
  }, [newEmployee.hospitalNumber, patientMode, input.organizationId]);

  const updateThreshold = (updated: AudiogramThresholdObservation) => {
    setInput((current) => ({
      ...current,
      thresholds: current.thresholds.map((item) => {
        return thresholdKey(item.ear, item.frequencyHz)
          === thresholdKey(updated.ear, updated.frequencyHz) ? updated : item;
      }),
    }));
  };

  const defaultExaminerId = (organizationId: string) => {
    const options = workspace.examiners.filter((item) => item.global || item.organizationIds.includes(organizationId));
    return options.find((item) => item.id === workspace.currentUserId)?.id ?? options[0]?.id ?? null;
  };

  const setHistoryResponses = (responses: PaperlessHistoryResponse[]) => {
    setInput((current) => ({
      ...current,
      historyResponses: responses,
      pretest: {
        ...current.pretest,
        historyCaptureMode: current.pretest.sourceHistoryAudiogramId
          ? "UPDATED_FROM_PRIOR"
          : "QUICK_SCREEN",
      },
    }));
  };

  const resetHistoryForContext = (next: PaperlessAudiogramInput) => ({
    ...next,
    pretest: {
      ...next.pretest,
      historyCaptureMode: "QUICK_SCREEN" as const,
      sourceHistoryAudiogramId: null,
    },
    historyResponses: createBlankHistoryResponses(),
    importantHistory: {
      captureMode: "UPDATED_CURRENT" as const,
      sourceAudiogramId: null,
      conditions: [],
    },
  });

  const payload = JSON.stringify({
    draftId,
    input,
    newEmployee: patientMode === "new" ? {
      hospitalNumber: newEmployee.hospitalNumber,
      departmentId: newEmployee.departmentId || null,
      employeeNumber: newEmployee.employeeNumber,
      firstName: newEmployee.firstName,
      lastName: newEmployee.lastName,
      sex: newEmployee.sex || null,
      dateOfBirth: newEmployee.dateOfBirth || null,
      jobTitle: newEmployee.jobTitle || null,
      employmentStartDate: newEmployee.employmentStartDate || null,
      transitionMode: newEmployee.transitionMode || null,
      effectiveDate: newEmployee.effectiveDate || null,
      priorEmployeeId: newEmployee.priorEmployeeId || null,
    } : null,
  });

  return (
    <form action={action} className="space-y-0 border-t border-[#bcc4bf]">
      <input type="hidden" name="payload" value={payload} />
      {state.error ? (
        <div role="alert" className="border-l-2 border-[#a83232] bg-[#f8eaea] px-5 py-4 text-sm leading-6 text-[#8e2929]">
          {state.error}
        </div>
      ) : null}

      <WizardSection number="1" icon={UserRound} title="ค้นหาหรือลงทะเบียนผู้รับการตรวจ" description="HN เป็นเลขโรงพยาบาล 7 หลักและมองเห็นเฉพาะทีมโรงพยาบาล">
        <div className="mb-4 flex gap-2">
          <ModeButton active={patientMode === "existing"} onClick={() => setPatientMode("existing")}>ค้นหารายชื่อเดิม</ModeButton>
          {!draftId ? <ModeButton active={patientMode === "new"} onClick={() => {
            setPatientMode("new");
            setPriorHistory(null);
            setHistoryEditorVisible(true);
            setInput(resetHistoryForContext({ ...input, employeeId: "", examType: "BASELINE", sourceMonitoringAudiogramId: null, followUpCaseId: null }));
          }}>เพิ่มคนใหม่</ModeButton> : null}
        </div>
        {patientMode === "existing" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="ค้นหา HN / ชื่อ / รหัสพนักงาน">
              <input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="ค้นด้วย HN หรือชื่อพนักงาน" className={inputClass} />
            </Field>
            <Field label="ผู้รับการตรวจ">
              <select required disabled={Boolean(draftId)} value={input.employeeId} onChange={(event) => {
                const employee = workspace.employees.find((item) => item.id === event.target.value);
                setPriorHistory(null);
                setHistoryEditorVisible(true);
                setInput(resetHistoryForContext({
                  ...input,
                  organizationId: employee?.organizationId ?? input.organizationId,
                  employeeId: event.target.value,
                  examinerUserId: defaultExaminerId(employee?.organizationId ?? input.organizationId),
                  sourceMonitoringAudiogramId: null,
                  followUpCaseId: null,
                }));
              }} className={inputClass}>
                <option value="">เลือกรายชื่อ</option>
                {matchingEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>HN {employee.hospitalNumber} · {employee.fullName} · {employee.employeeNumber}</option>
                ))}
              </select>
            </Field>
            {selectedEmployee ? <p className="md:col-span-2 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">HN <strong>{selectedEmployee.hospitalNumber}</strong> · {selectedEmployee.organizationName} · {selectedEmployee.departmentName ?? "ไม่ระบุแผนก"}</p> : null}
          </div>
        ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="HN 7 หลัก"><input required inputMode="numeric" pattern="\d{7}" maxLength={7} value={newEmployee.hospitalNumber} onChange={(event) => { setPatientEmploymentSummary(null); setNewEmployee({ ...newEmployee, hospitalNumber: event.target.value.replace(/\D/g, "").slice(0, 7), transitionMode: "", priorEmployeeId: "" }); }} className={inputClass} />{patientLookupPending ? <span className="mt-1 block text-xs text-teal-700">กำลังตรวจ HN เดิม…</span> : null}</Field>
            <Field label="แผนก"><select value={newEmployee.departmentId} onChange={(event) => setNewEmployee({ ...newEmployee, departmentId: event.target.value })} className={inputClass}><option value="">ไม่ระบุ</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="รหัสพนักงาน"><input required value={newEmployee.employeeNumber} onChange={(event) => setNewEmployee({ ...newEmployee, employeeNumber: event.target.value })} className={inputClass} /></Field>
            <Field label="ชื่อ"><input required value={newEmployee.firstName} onChange={(event) => setNewEmployee({ ...newEmployee, firstName: event.target.value })} className={inputClass} /></Field>
            <Field label="นามสกุล"><input required value={newEmployee.lastName} onChange={(event) => setNewEmployee({ ...newEmployee, lastName: event.target.value })} className={inputClass} /></Field>
            <Field label="เพศ"><select value={newEmployee.sex} onChange={(event) => setNewEmployee({ ...newEmployee, sex: event.target.value })} className={inputClass}><option value="">ไม่ระบุ</option><option value="MALE">ชาย</option><option value="FEMALE">หญิง</option><option value="OTHER">อื่น ๆ</option></select></Field>
            <Field label="วันเกิด"><input type="date" value={newEmployee.dateOfBirth} onChange={(event) => setNewEmployee({ ...newEmployee, dateOfBirth: event.target.value })} className={inputClass} /></Field>
            <Field label="ตำแหน่งงาน"><input value={newEmployee.jobTitle} onChange={(event) => setNewEmployee({ ...newEmployee, jobTitle: event.target.value })} className={inputClass} /></Field>
            <Field label="วันที่เริ่มงาน"><input type="date" value={newEmployee.employmentStartDate} onChange={(event) => setNewEmployee({ ...newEmployee, employmentStartDate: event.target.value, effectiveDate: event.target.value })} className={inputClass} /></Field>
          </div>
          {patientEmploymentSummary ? <EmploymentTransitionPanel
            summary={patientEmploymentSummary}
            organizationId={input.organizationId}
            value={newEmployee}
            onChange={setNewEmployee}
            onUseExisting={(employeeId) => {
              const existing = workspace.employees.find((item) => item.id === employeeId);
              if (!existing) return;
              setPatientMode("existing");
              setInput(resetHistoryForContext({ ...input, organizationId: existing.organizationId, employeeId: existing.id, examinerUserId: defaultExaminerId(existing.organizationId) }));
            }}
          /> : null}
          </>
        )}
      </WizardSection>

      <WizardSection number="2" icon={ClipboardCheck} title="วัตถุประสงค์และข้อมูลการตรวจ" description="ผลเข้าเกณฑ์ไทยให้ตรวจซ้ำภายใน 30 วัน; quiet period ใช้ประเมินหลักฐาน NIOSH แยกต่างหาก">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="บริษัท / สถานประกอบการ">
            <select required disabled={Boolean(draftId)} value={input.organizationId} onChange={(event) => {
              setPriorHistory(null);
              setPatientEmploymentSummary(null);
              setHistoryEditorVisible(true);
              setNewEmployee({ ...newEmployee, departmentId: "", transitionMode: "", priorEmployeeId: "" });
              setInput(resetHistoryForContext({
                ...input,
                organizationId: event.target.value,
                employeeId: "",
                examinerUserId: defaultExaminerId(event.target.value),
                sourceMonitoringAudiogramId: null,
                followUpCaseId: null,
              }));
            }} className={inputClass}>
              <option value="">เลือกบริษัท</option>
              {workspace.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.label}</option>)}
            </select>
            {!draftId ? canCreateOrganization
              ? <Link href="/companies/new?returnTo=/paperless-audiometry/new" className="mt-1.5 inline-block text-xs font-semibold text-teal-700 hover:underline">ไม่พบชื่อบริษัท? เพิ่มบริษัทใหม่ก่อน</Link>
              : <span className="mt-1.5 block text-xs text-slate-500">หากไม่พบชื่อบริษัท กรุณาให้ Hospital Admin เพิ่มบริษัทก่อน</span> : null}
          </Field>
          <Field label="ประเภทการตรวจ"><select value={input.examType} onChange={(event) => {
            setPriorHistory(null);
            setHistoryEditorVisible(true);
            setInput({
              ...input,
              examType: event.target.value as PaperlessAudiogramInput["examType"],
              hoursSinceNoiseExposure: null,
              sourceMonitoringAudiogramId: null,
              followUpCaseId: null,
              pretest: {
                ...input.pretest,
                historyCaptureMode: "QUICK_SCREEN",
                sourceHistoryAudiogramId: null,
                quietPeriodAnswer: "UNKNOWN",
                quietPeriodHours: null,
                hearingProtectionDuringQuiet: "UNKNOWN",
                highNonoccupationalNoise: "UNKNOWN",
              },
              historyResponses: createBlankHistoryResponses(),
            });
          }} className={inputClass}>{availableExamOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          {(input.examType === "REPEAT" || input.examType === "CONFIRMATION") ? (
            <Field label="Monitoring / เคสต้นเหตุ"><select required value={input.sourceMonitoringAudiogramId ?? ""} onChange={(event) => {
              const sequence = sequences.find((item) => item.monitoringAudiogramId === event.target.value);
              setPriorHistory(null);
              setHistoryEditorVisible(true);
              setInput({ ...input, sourceMonitoringAudiogramId: sequence?.monitoringAudiogramId ?? null, followUpCaseId: sequence?.followUpCaseId ?? null, pretest: { ...input.pretest, historyCaptureMode: "QUICK_SCREEN", sourceHistoryAudiogramId: null }, historyResponses: createBlankHistoryResponses() });
            }} className={inputClass}><option value="">เลือก Monitoring</option>{sequences.map((item) => <option key={item.followUpCaseId} value={item.monitoringAudiogramId}>{item.examDate} · {item.status}</option>)}</select></Field>
          ) : null}
          <Field label="ผู้ตรวจ">
            <select required value={input.examinerUserId ?? ""} onChange={(event) => setInput({ ...input, examinerUserId: event.target.value || null })} className={inputClass}>
              <option value="">เลือกผู้ตรวจ</option>
              {availableExaminers.map((examiner) => <option key={examiner.id} value={examiner.id}>{examiner.fullName}</option>)}
            </select>
          </Field>
          {activeAudiometers.length > 1 ? <Field label="เครื่องตรวจ">
            <select required value={input.audiometerId ?? ""} onChange={(event) => setInput({ ...input, audiometerId: event.target.value || null, equipmentCalibrationAcknowledged: false })} className={inputClass}>
              <option value="">เลือกเครื่องตรวจ</option>
              {activeAudiometers.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.model}</option>)}
            </select>
          </Field> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold text-slate-500">เครื่องตรวจ</p><p className="mt-1 text-sm font-semibold text-slate-900">{selectedAudiometer ? `${selectedAudiometer.displayName} · ${selectedAudiometer.model}` : "ยังไม่มีเครื่อง active"}</p><p className="mt-1 text-xs text-slate-500">เลือกอัตโนมัติ · serial เก็บใน audit โดยไม่ต้องกรอก</p></div>}
        </div>
        {selectedAudiometer && calibrationStatus !== "CURRENT" ? <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><input type="checkbox" className="mt-1" checked={input.equipmentCalibrationAcknowledged} onChange={(event) => setInput({ ...input, equipmentCalibrationAcknowledged: event.target.checked })} /><span><strong className="block"><AlertTriangle className="mr-1.5 inline" size={16} />การสอบเทียบ {calibrationStatus === "OVERDUE" ? "เกิน 1 ปี" : "ไม่ทราบสถานะ"}</strong><span className="mt-1 block leading-6">{selectedAudiometer.calibrationDate ? `วันที่สอบเทียบล่าสุด ${selectedAudiometer.calibrationDate}` : "ยังไม่มีวันที่สอบเทียบใน master"} · ต้องรับทราบก่อน Final แต่ยังบันทึก Draft ได้</span></span></label> : null}
        <button type="button" onClick={() => setAdditionalDetailsVisible((visible) => !visible)} className="hg-interactive hg-pressable mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-700"><ChevronDown size={17} className={`hg-disclosure-icon ${additionalDetailsVisible ? "rotate-180" : ""}`} /> ข้อมูลเพิ่มเติม</button>
        {additionalDetailsVisible ? <div className="hg-fade-enter mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="วันและเวลาตรวจ"><input required type="datetime-local" value={toLocalDateTime(input.examinedAt)} onChange={(event) => { if (event.target.value) { setPriorHistory(null); setInput({ ...input, examinedAt: new Date(event.target.value).toISOString(), equipmentCalibrationAcknowledged: false }); } }} className={inputClass} /></Field>
          <Field label="สถานที่ตรวจ"><input readOnly value={selectedAudiometer?.location ?? ""} className={`${inputClass} bg-slate-100`} /></Field>
          <Field label="บริบท/หมายเหตุการตรวจ"><input value={input.testContext} onChange={(event) => setInput({ ...input, testContext: event.target.value })} className={inputClass} /></Field>
        </div> : null}
        {(patientMode === "new" || (selectedEmployee && !selectedEmployee.hasActiveBaseline)) ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">บริษัทนี้ยังไม่มี Thai operational baseline สำหรับพนักงานคนนี้ แนะนำตรวจประเภท Baseline และส่งแพทย์อนุมัติ หากเลือก Annual ผล Thai/OSHA จะเป็น Not evaluable จนกว่าจะมี baseline ใหม่</div> : null}
      </WizardSection>

      <WizardSection number="3" icon={Stethoscope} title="พักเสียง ประวัติ และ Otoscopy" description="คำตอบถูกเก็บเป็น snapshot ของการตรวจครั้งนี้ ไม่แก้ประวัติย้อนหลัง">
        {requiresDocumentedQuietPeriod ? <div className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">พักเสียงก่อนตรวจ {input.examType === "BASELINE" ? "· เป้าหมายอย่างน้อย 14 ชั่วโมง" : "· ไม่บังคับสำหรับ workflow ไทย"}</p>{input.examType === "CONFIRMATION" ? <p className="mt-1 text-xs leading-5 text-slate-500">NIOSH ต้องมี quiet period อย่างน้อย 12 ชั่วโมง โดยไม่มีเสียงดังจากงานหรือนอกงาน และห้ามใช้ PPE แทนการพักเสียง</p> : null}</div>{nioshConfirmationEvidence ? <NioshEvidenceIndicator assessment={nioshConfirmationEvidence} /> : null}</div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label={input.examType === "CONFIRMATION" ? "หลีกเลี่ยงเสียงดังจากงานก่อนตรวจหรือไม่" : "พักเสียงมาก่อนหรือไม่"}><AnswerSelect value={input.pretest.quietPeriodAnswer} onChange={(value) => setInput({ ...input, pretest: { ...input.pretest, quietPeriodAnswer: value } })} /></Field>
          <Field label="พักเสียงกี่ชั่วโมง"><input type="number" min="0" max="168" step="0.5" value={input.pretest.quietPeriodHours ?? ""} onChange={(event) => setInput({ ...input, hoursSinceNoiseExposure: event.target.value ? Number(event.target.value) : null, pretest: { ...input.pretest, quietPeriodHours: event.target.value ? Number(event.target.value) : null } })} className={inputClass} /></Field>
          <Field label={input.examType === "CONFIRMATION" ? "ใช้ PPE แทนการพักเสียงหรือไม่" : "ใช้อุปกรณ์ป้องกันระหว่างพัก"}><AnswerSelect value={input.pretest.hearingProtectionDuringQuiet} onChange={(value) => setInput({ ...input, pretest: { ...input.pretest, hearingProtectionDuringQuiet: value } })} /></Field>
          <Field label="มีเสียงดังนอกงานก่อนตรวจ"><AnswerSelect value={input.pretest.highNonoccupationalNoise} onChange={(value) => setInput({ ...input, pretest: { ...input.pretest, highNonoccupationalNoise: value } })} /></Field>
        </div></div> : <div className="grid gap-3 md:grid-cols-2"><Field label="มีเสียงดังมากก่อนตรวจครั้งนี้หรือไม่"><AnswerSelect value={input.pretest.highNonoccupationalNoise} onChange={(value) => setInput({ ...input, pretest: { ...input.pretest, highNonoccupationalNoise: value } })} /></Field><Field label="ถ้าทราบ ระบุชั่วโมงจากเสียงดังล่าสุด"><input type="number" min="0" max="168" step="0.5" value={input.pretest.quietPeriodHours ?? ""} onChange={(event) => setInput({ ...input, hoursSinceNoiseExposure: event.target.value ? Number(event.target.value) : null, pretest: { ...input.pretest, quietPeriodHours: event.target.value ? Number(event.target.value) : null, quietPeriodAnswer: event.target.value ? "YES" : "UNKNOWN" } })} className={inputClass} /></Field></div>}
        <ImportantHistoryPanel
          conditions={input.importantHistory.conditions}
          editing={importantHistoryEditorVisible}
          sourceLocked={input.importantHistory.captureMode === "COPY_SOURCE"}
          onConfirm={() => {
            setInput({ ...input, importantHistory: { captureMode: "CONFIRMED_CURRENT", sourceAudiogramId: null, conditions: activeImportantHistory } });
            setImportantHistoryEditorVisible(false);
          }}
          onEdit={() => {
            setInput({ ...input, importantHistory: { ...input.importantHistory, captureMode: "UPDATED_CURRENT", sourceAudiogramId: null } });
            setImportantHistoryEditorVisible(true);
          }}
          onChange={(conditions) => setInput({ ...input, importantHistory: { captureMode: "UPDATED_CURRENT", sourceAudiogramId: null, conditions } })}
        />
        <div className="mt-5 border-t border-[#bcc4bf] pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-950">Quick history</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">คัดกรองสั้นก่อน รายการย่อยจะแสดงเฉพาะเมื่อพบอาการหรือประวัติเสี่ยง</p>
            </div>
            {priorHistoryLoading ? <span className="text-xs font-semibold text-teal-700">กำลังค้นประวัติเดิม…</span> : null}
          </div>

          {priorHistory ? (
            <div className="mt-4 border-l-2 border-[#1d6c67] bg-[#e7f0ed]/60 p-4">
              <p className="text-sm font-semibold text-teal-950">พบประวัติ Final วันที่ {formatThaiDateTime(priorHistory.examinedAt)}</p>
              <p className="mt-1 text-sm leading-6 text-teal-800">
                {priorHistory.positiveResponses.length > 0
                  ? priorHistory.positiveResponses.map((item) => historyLabel(item.questionCode)).join(" · ")
                  : "ไม่พบรายการที่ตอบ Yes"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ModeButton active={input.pretest.historyCaptureMode === "UNCHANGED_FROM_PRIOR"} onClick={() => {
                  setInput({ ...input, historyResponses: priorHistory.responses, pretest: { ...input.pretest, historyCaptureMode: "UNCHANGED_FROM_PRIOR", sourceHistoryAudiogramId: priorHistory.sourceAudiogramId }, importantHistory: { captureMode: "CONFIRMED_CURRENT", sourceAudiogramId: null, conditions: priorHistory.importantHistory } });
                  setHistoryEditorVisible(false);
                  setImportantHistoryEditorVisible(false);
                }}>ยืนยันว่าไม่มีการเปลี่ยนแปลง</ModeButton>
                <ModeButton active={input.pretest.historyCaptureMode === "UPDATED_FROM_PRIOR"} onClick={() => {
                  setInput({ ...input, historyResponses: priorHistory.responses, pretest: { ...input.pretest, historyCaptureMode: "UPDATED_FROM_PRIOR", sourceHistoryAudiogramId: priorHistory.sourceAudiogramId }, importantHistory: { captureMode: "UPDATED_CURRENT", sourceAudiogramId: null, conditions: priorHistory.importantHistory } });
                  setHistoryEditorVisible(true);
                  setImportantHistoryEditorVisible(true);
                }}>มีข้อมูลเปลี่ยนแปลง</ModeButton>
                <ModeButton active={input.pretest.historyCaptureMode === "QUICK_SCREEN" && historyEditorVisible} onClick={() => {
                  setInput({ ...input, historyResponses: createBlankHistoryResponses(), pretest: { ...input.pretest, historyCaptureMode: "QUICK_SCREEN", sourceHistoryAudiogramId: null } });
                  setHistoryEditorVisible(true);
                }}>ซักประวัติใหม่</ModeButton>
              </div>
            </div>
          ) : null}

          {!historyEditorVisible ? (
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              ยืนยัน snapshot จาก record {input.pretest.sourceHistoryAudiogramId?.slice(0, 8)}… แล้ว ระบบจะคัดลอกคำตอบทั้ง 21 ข้อจากฐานข้อมูลเมื่อบันทึก
            </div>
          ) : (
            <QuickHistoryEditor
              state={quickHistoryState}
              responses={input.historyResponses}
              onStateChange={(value) => setHistoryResponses(applyQuickHistoryState(input.historyResponses, value))}
              onFindingChange={(code, checked) => setHistoryResponses(setQuickHistoryFinding(input.historyResponses, code, checked))}
              onResponseChange={(code, changes) => setHistoryResponses(input.historyResponses.map((item) => item.questionCode === code ? { ...item, ...changes } : item))}
            />
          )}
        </div>
        <div className="mt-5 grid border-y border-[#bcc4bf] lg:grid-cols-2">{input.otoscopyFindings.map((finding) => <div key={finding.ear} className="p-4 lg:odd:border-r lg:odd:border-[#d5dad5]"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#1d6c67]">Paired examination</p><h3 className="mt-1 font-semibold text-slate-900">Otoscopy · {finding.ear === "LEFT" ? "หูซ้าย" : "หูขวา"}</h3><select value={finding.examinationStatus} onChange={(event) => { const examinationStatus = event.target.value as typeof finding.examinationStatus; setInput({ ...input, otoscopyFindings: input.otoscopyFindings.map((item) => item.ear === finding.ear ? { ...item, examinationStatus, ...(examinationStatus === "ABNORMAL" ? {} : { canalObstruction: false, abnormalTympanicMembrane: false, perforation: false, otherFinding: false }) } : item) }); }} className={`${inputClass} mt-3`}><option value="NOT_EXAMINED">ไม่ได้ตรวจ</option><option value="NORMAL">ปกติ</option><option value="ABNORMAL">ผิดปกติ</option></select><div className="mt-3 flex flex-wrap gap-3 text-sm">{otoscopyChecks.map((check) => <label key={check.key} className="inline-flex items-center gap-2"><input type="checkbox" disabled={finding.examinationStatus !== "ABNORMAL"} checked={finding[check.key]} onChange={(event) => setInput({ ...input, otoscopyFindings: input.otoscopyFindings.map((item) => item.ear === finding.ear ? { ...item, [check.key]: event.target.checked } : item) })} /> {check.label}</label>)}</div><input placeholder="หมายเหตุ" value={finding.notes} onChange={(event) => setInput({ ...input, otoscopyFindings: input.otoscopyFindings.map((item) => item.ear === finding.ear ? { ...item, notes: event.target.value } : item) })} className={`${inputClass} mt-3`} /></div>)}</div>
      </WizardSection>

      <WizardSection number="4" icon={Ear} title="Pure-tone air-conduction 7 ความถี่" description="กรอกตัวเลข = Measured · เว้นว่าง = Not tested · กรอกระดับแล้วกด NR = No response">
        <div className="overflow-x-auto border-y border-[#bcc4bf]">
          <table className="w-full min-w-[560px] text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500"><tr><th className="px-4 py-3 text-left">Frequency</th><th className="px-4 py-3 text-left">Left dB HL</th><th className="px-4 py-3 text-left">Right dB HL</th></tr></thead><tbody className="divide-y divide-slate-100">{frequencies.map((frequency) => { const left = input.thresholds.find((item) => item.ear === "LEFT" && item.frequencyHz === frequency)!; const right = input.thresholds.find((item) => item.ear === "RIGHT" && item.frequencyHz === frequency)!; return <tr key={frequency}><td className="px-4 py-3 font-semibold text-slate-900">{frequency} Hz</td><ThresholdEntryCell observation={left} onChange={updateThreshold} /><ThresholdEntryCell observation={right} onChange={updateThreshold} /></tr>; })}</tbody></table>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Tab / Shift+Tab จะเลื่อนช่องซ้าย–ขวาต่อเนื่อง · เมื่อโฟกัสช่องที่มีค่า กด N เพื่อสลับ NR</p>
        <div className="mt-5"><AudiogramPreview observations={input.thresholds} /></div>
      </WizardSection>

      <WizardSection number="5" icon={Activity} title="ตรวจทานและบันทึก" description="Save Draft แก้ไขต่อได้; Final จะล็อก record และรัน Thai/OSHA ตาม lifecycle">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Summary label="ผู้รับการตรวจ" value={patientMode === "new" ? `${newEmployee.firstName} ${newEmployee.lastName}` : selectedEmployee?.fullName ?? "ยังไม่เลือก"} /><Summary label="ประเภท" value={availableExamOptions.find((item) => item.value === input.examType)?.label ?? input.examType} /><Summary label="Measured" value={`${thresholdCounts.MEASURED} จุด`} /><Summary label="NR" value={`${thresholdCounts.NO_RESPONSE} จุด`} /><Summary label="Not tested" value={`${thresholdCounts.NOT_TESTED} จุด`} /></div>
        <div className="mt-4"><ImportantHistorySummary conditions={activeImportantHistory} legacy={input.importantHistory.captureMode === "LEGACY_NONE"} /></div>
        {nioshConfirmationEvidence ? <div className="mt-4"><NioshEvidenceIndicator assessment={nioshConfirmationEvidence} expanded /></div> : null}
        {thresholdCounts.NOT_TESTED > 0 ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">มี Not tested {thresholdCounts.NOT_TESTED} จุด — บันทึก Draft ได้ แต่ผล Thai/OSHA อาจเป็น Not evaluable หากขาดความถี่ที่กฎใช้{input.examType === "BASELINE" ? " และจะเสนอเป็น baseline ไม่ได้จนกว่าจะ Measured ครบ 14 จุด" : ""}</div> : null}
        {input.examType === "BASELINE" && (input.pretest.quietPeriodAnswer !== "YES" || (input.pretest.quietPeriodHours ?? 0) < 14) ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">พักเสียงไม่ครบ 14 ชั่วโมง — เก็บ Final ได้ แต่ระบบจะไม่อนุญาตให้เสนอ record นี้เป็น operational baseline</div> : null}
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm"><input type="checkbox" checked={input.isValid} onChange={(event) => setInput({ ...input, isValid: event.target.checked })} className="mt-0.5" /><span><strong className="block text-slate-900">Record valid for rule evaluation</strong><span className="mt-1 block text-slate-500">หากไม่ valid Thai/OSHA จะคืน Not evaluable</span></span></label>
        <Field label="Validation notes"><textarea rows={3} value={input.validationNotes} onChange={(event) => setInput({ ...input, validationNotes: event.target.value })} className={inputClass} /></Field>
      </WizardSection>

      <div className="sticky bottom-3 z-10 flex flex-wrap justify-end gap-3 border border-[#bcc4bf] bg-[#fafaf7]/96 p-3 shadow-lg backdrop-blur print:hidden">
        <button type="submit" name="intent" value="save" disabled={pending} className="hg-interactive hg-pressable inline-flex items-center gap-2 border border-[#bcc4bf] bg-white px-4 py-2.5 text-sm font-semibold text-[#46504d] hover:bg-[#f2f1ec] disabled:opacity-50"><Save size={17} /> {pending ? "กำลังบันทึก…" : "Save Draft"}</button>
        <button type="submit" name="intent" value="finalize" disabled={pending} onClick={(event) => {
          if (thresholdCounts.NOT_TESTED > 0 && !window.confirm(`มี Not tested ${thresholdCounts.NOT_TESTED} จุด ผลกฎอาจเป็น Not evaluable ต้องการ Final ต่อหรือไม่?`)) event.preventDefault();
        }} className="hg-interactive hg-pressable inline-flex items-center gap-2 border border-[#1d6c67] bg-[#1d6c67] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#15534f] disabled:opacity-50"><ClipboardCheck size={17} /> Finalize record</button>
      </div>
    </form>
  );
}

const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const compactInputClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const creatableExamOptions = [
  { value: "BASELINE", label: "Baseline" },
  { value: "ANNUAL", label: "Annual monitoring" },
  { value: "CONFIRMATION", label: "ตรวจซ้ำภายใน 30 วัน" },
  { value: "OTHER", label: "Other" },
] as const;
const legacyRepeatOption = { value: "REPEAT", label: "Immediate retest (legacy)" } as const;
const otoscopyChecks = [
  { key: "canalObstruction", label: "Canal obstruction" },
  { key: "abnormalTympanicMembrane", label: "Abnormal tympanic membrane" },
  { key: "perforation", label: "Perforation" },
  { key: "otherFinding", label: "Other" },
] as const;

function NioshEvidenceIndicator({
  assessment,
  expanded = false,
}: {
  assessment: NioshConfirmationEvidenceAssessment;
  expanded?: boolean;
}) {
  const configuration = {
    ELIGIBLE: {
      label: "ครบเงื่อนไขข้อมูล NIOSH",
      detail: "หลักฐานพักเสียงครบ ระบบจะวิเคราะห์ NIOSH persistence หลัง Final",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    NOT_ELIGIBLE: {
      label: "ไม่ครบเงื่อนไข NIOSH",
      detail: "ยัง Final และจบขั้นตรวจซ้ำตาม workflow ไทยได้",
      className: "border-amber-200 bg-amber-50 text-amber-900",
    },
    INSUFFICIENT_DATA: {
      label: "ข้อมูล NIOSH ไม่เพียงพอ",
      detail: "กรอกชั่วโมงพักเสียงและตอบคำถามให้ครบ หากต้องการใช้เป็นหลักฐาน NIOSH",
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
  }[assessment.status];

  return (
    <div className={`border px-3 py-2 ${expanded ? "rounded-lg" : "rounded-full"} ${configuration.className}`}>
      <p className="text-xs font-semibold">{configuration.label}</p>
      {expanded ? <p className="mt-1 text-xs leading-5">{configuration.detail}</p> : null}
    </div>
  );
}

function WizardSection({ number, icon: Icon, title, description, children }: { number: string; icon: typeof UserRound; title: string; description: string; children: React.ReactNode }) {
  return <section className="grid border-b border-[#bcc4bf] bg-[#fafaf7]/28 lg:grid-cols-[9.5rem_1fr]"><header className="border-b border-[#d5dad5] px-5 py-5 lg:border-b-0 lg:border-r lg:px-4"><div className="flex items-start gap-3 lg:block"><span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1d6c67]"><Icon size={15} strokeWidth={1.7} />Step {number}</span><div><h2 className="mt-1 font-semibold leading-6 text-[#18201e]">{title}</h2><p className="mt-1 text-xs leading-5 text-[#68716e]">{description}</p></div></div></header><div className="p-5 sm:p-6 lg:p-7">{children}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`hg-interactive hg-pressable border-b-2 px-3.5 py-2 text-sm font-semibold ${active ? "border-[#1d6c67] bg-[#e7f0ed]/60 text-[#15534f]" : "border-[#d5dad5] bg-transparent text-[#68716e] hover:border-[#68716e]"}`}>{children}</button>;
}

function AnswerSelect({ value, onChange, compact = false }: { value: "YES" | "NO" | "UNKNOWN"; onChange: (value: "YES" | "NO" | "UNKNOWN") => void; compact?: boolean }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as typeof value)} className={compact ? compactInputClass : inputClass}><option value="UNKNOWN">ไม่ทราบ</option><option value="NO">ไม่</option><option value="YES">ใช่</option></select>;
}

function ThresholdEntryCell({ observation, onChange }: { observation: AudiogramThresholdObservation; onChange: (value: AudiogramThresholdObservation) => void }) {
  const value = observation.responseStatus === "MEASURED" ? observation.thresholdDbHl : observation.responseStatus === "NO_RESPONSE" ? observation.noResponseAtDbHl : "";
  return <td className="px-4 py-2.5"><div className={`border-l-2 px-2 py-1.5 ${observation.responseStatus === "NO_RESPONSE" ? "border-[#a83232] bg-[#f8eaea]" : "border-[#bcc4bf] bg-white focus-within:border-[#1d6c67]"}`}><div className="flex items-center gap-2"><input aria-label={`${observation.ear} ${observation.frequencyHz} Hz`} type="number" min="-20" max="140" step="5" value={value} onChange={(event) => onChange(setThresholdNumericValue(observation, event.target.value))} onKeyDown={(event) => { if (event.key.toLowerCase() === "n" && observation.responseStatus !== "NOT_TESTED") { event.preventDefault(); onChange(toggleThresholdNoResponse(observation)); } }} className="h-7 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm font-semibold text-[#18201e] outline-none" /><button type="button" tabIndex={-1} disabled={observation.responseStatus === "NOT_TESTED"} onClick={() => onChange(toggleThresholdNoResponse(observation))} className={`px-2 py-1 font-mono text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-35 ${observation.responseStatus === "NO_RESPONSE" ? "bg-[#a83232] text-white" : "bg-[#e9ebe7] text-[#68716e] hover:bg-[#d5dad5]"}`} aria-pressed={observation.responseStatus === "NO_RESPONSE"}>NR</button></div><p className={`px-1 font-mono text-[9px] font-medium ${observation.responseStatus === "NO_RESPONSE" ? "text-[#a83232]" : observation.responseStatus === "NOT_TESTED" ? "text-[#a56817]" : "text-[#8c9692]"}`}>{observation.responseStatus === "NO_RESPONSE" ? `No response @ ${value} dB HL` : observation.responseStatus === "NOT_TESTED" ? "Not tested" : "Measured"}</p></div></td>;
}

function QuickHistoryEditor({ state, responses, onStateChange, onFindingChange, onResponseChange }: {
  state: QuickHistoryState;
  responses: PaperlessHistoryResponse[];
  onStateChange: (value: QuickHistoryState) => void;
  onFindingChange: (code: PaperlessHistoryQuestionCode, checked: boolean) => void;
  onResponseChange: (code: PaperlessHistoryQuestionCode, changes: Partial<PaperlessHistoryResponse>) => void;
}) {
  const earRelated = new Set<PaperlessHistoryQuestionCode>(PAPERLESS_EAR_RELATED_HISTORY_CODES);
  const responseFor = (code: PaperlessHistoryQuestionCode) => responses.find((item) => item.questionCode === code) ?? {
    questionCode: code,
    answer: "UNKNOWN" as const,
    earScope: null,
    details: "",
  };
  return <div className="mt-4 space-y-5">
    <div className="grid gap-2 sm:grid-cols-3">
      <QuickChoice active={state === "NONE"} onClick={() => onStateChange("NONE")} title="ไม่มีอาการหรือประวัติเสี่ยง" description="ตั้งกลุ่มเสี่ยงเป็น No" />
      <QuickChoice active={state === "HAS_FINDINGS"} onClick={() => onStateChange("HAS_FINDINGS")} title="มีอาการ/ประวัติ" description="เลือกรายการที่พบ" />
      <QuickChoice active={state === "UNKNOWN"} onClick={() => onStateChange("UNKNOWN")} title="ข้อมูลไม่แน่ชัด" description="ตั้งกลุ่มเสี่ยงเป็น Unknown" />
    </div>
    <div className="grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
      {PAPERLESS_ALWAYS_ASK_HISTORY_CODES.map((code) => {
        const response = responseFor(code);
        return <Field key={code} label={historyLabel(code)}><AnswerSelect value={response.answer} onChange={(answer) => onResponseChange(code, { answer })} /></Field>;
      })}
    </div>
    {state === "HAS_FINDINGS" ? <div className="space-y-5 border-t border-slate-200 pt-5">
      {PAPERLESS_HISTORY_GROUPS.map((group) => <div key={group.label}>
        <h4 className="text-sm font-semibold text-slate-900">{group.label}</h4>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">{group.codes.map((code) => {
          const response = responseFor(code);
          const selected = response.answer === "YES";
          return <div key={code} className={`rounded-lg border p-3 ${selected ? "border-teal-300 bg-teal-50/50" : "border-slate-200"}`}>
            <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-slate-800"><input type="checkbox" className="mt-0.5" checked={selected} onChange={(event) => onFindingChange(code, event.target.checked)} /><span>{historyLabel(code)}</span></label>
            {selected ? <div className={`mt-3 grid gap-2 ${earRelated.has(code) ? "sm:grid-cols-[140px_1fr]" : ""}`}>
              {earRelated.has(code) ? <select aria-label={`ข้างหู ${historyLabel(code)}`} value={response.earScope ?? "BOTH"} onChange={(event) => onResponseChange(code, { earScope: event.target.value as "LEFT" | "RIGHT" | "BOTH" })} className={compactInputClass}><option value="LEFT">หูซ้าย</option><option value="RIGHT">หูขวา</option><option value="BOTH">สองข้าง</option></select> : null}
              <input aria-label={`รายละเอียด ${historyLabel(code)}`} placeholder="รายละเอียด (ถ้ามี)" value={response.details} onChange={(event) => onResponseChange(code, { details: event.target.value })} className={compactInputClass} />
            </div> : null}
          </div>;
        })}</div>
      </div>)}
    </div> : null}
  </div>;
}

function QuickChoice({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return <button type="button" onClick={onClick} className={`hg-surface-interactive rounded-xl border p-3 text-left ${active ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className={`block text-sm font-semibold ${active ? "text-teal-900" : "text-slate-800"}`}>{title}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></button>;
}

function ImportantHistoryPanel({ conditions, editing, sourceLocked, onConfirm, onEdit, onChange }: {
  conditions: ImportantHearingCondition[];
  editing: boolean;
  sourceLocked: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onChange: (conditions: ImportantHearingCondition[]) => void;
}) {
  const active = conditions.filter((item) => item.status === "ACTIVE");
  const conditionFor = (category: ImportantHearingCondition["category"]) =>
    conditions.find((item) => item.category === category && item.status === "ACTIVE")
    ?? conditions.find((item) => item.category === category);
  const toggle = (category: ImportantHearingCondition["category"], selected: boolean) => {
    const existing = conditionFor(category);
    if (selected) {
      if (existing) {
        onChange(conditions.map((item) => item === existing ? { ...item, status: "ACTIVE", statusReason: "" } : item));
      } else {
        onChange([...conditions, {
          id: null,
          category,
          earScope: "BOTH",
          onset: "UNKNOWN",
          source: "PATIENT_OR_FAMILY",
          details: "",
          status: "ACTIVE",
          statusReason: "",
        }]);
      }
    } else if (existing?.id) {
      onChange(conditions.map((item) => item === existing ? {
        ...item,
        status: "INACTIVE",
        statusReason: "ผู้ป่วย/ผู้ให้ข้อมูลยืนยันว่ารายการนี้ไม่ active แล้ว",
      } : item));
    } else {
      onChange(conditions.filter((item) => item !== existing));
    }
  };
  const update = (category: ImportantHearingCondition["category"], changes: Partial<ImportantHearingCondition>) => {
    const existing = conditionFor(category);
    if (!existing) return;
    onChange(conditions.map((item) => item === existing ? { ...item, ...changes } : item));
  };

  return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">ประวัติเดิม</p><h3 className="mt-1 font-semibold text-amber-950">ประวัติการได้ยินสำคัญ</h3><p className="mt-1 text-sm leading-6 text-amber-800">{sourceLocked ? "Correction จะคัดลอก snapshot จาก Final record ต้นฉบับ ไม่ดึง patient master ล่าสุด" : "ข้อมูลตาม HN ใช้ประกอบการตรวจเท่านั้น ไม่เปลี่ยนผลกฎหรือ workflow อัตโนมัติ"}</p></div>{!sourceLocked ? <div className="flex gap-2"><button type="button" onClick={onConfirm} className="hg-interactive hg-pressable rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900">ยืนยันว่าไม่เปลี่ยนแปลง</button><button type="button" onClick={onEdit} className="hg-interactive hg-pressable rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white">มีข้อมูลเปลี่ยนแปลง</button></div> : null}</div>
    {!editing ? <div className="mt-4"><ImportantHistorySummary conditions={active} legacy={false} /></div> : <div className="mt-4 space-y-3">{IMPORTANT_HEARING_HISTORY_CATEGORIES.map((category) => {
      const item = conditionFor(category);
      const selected = item?.status === "ACTIVE";
      return <div key={category} className={`rounded-lg border p-3 ${selected ? "border-amber-300 bg-white" : "border-amber-200 bg-amber-50/50"}`}><label className="flex items-start gap-2 text-sm font-semibold text-amber-950"><input type="checkbox" className="mt-0.5" checked={selected} onChange={(event) => toggle(category, event.target.checked)} />{importantCategoryLabel(category)}</label>{selected && item ? <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4"><select aria-label="ข้างหู" value={item.earScope} onChange={(event) => update(category, { earScope: event.target.value as ImportantHearingCondition["earScope"] })} className={compactInputClass}><option value="LEFT">หูซ้าย</option><option value="RIGHT">หูขวา</option><option value="BOTH">สองข้าง</option><option value="UNKNOWN">ไม่ทราบข้าง</option></select><select aria-label="ช่วงเริ่มเป็น" value={item.onset} onChange={(event) => update(category, { onset: event.target.value as ImportantHearingCondition["onset"] })} className={compactInputClass}><option value="CONGENITAL_OR_CHILDHOOD">กำเนิด/วัยเด็ก</option><option value="LATER">เกิดภายหลัง</option><option value="UNKNOWN">ไม่ทราบ</option></select><select aria-label="แหล่งข้อมูล" value={item.source} onChange={(event) => update(category, { source: event.target.value as ImportantHearingCondition["source"] })} className={compactInputClass}><option value="PATIENT_OR_FAMILY">ผู้ป่วย/ญาติแจ้ง</option><option value="PRIOR_MEDICAL_RECORD">เวชระเบียนเดิม</option>{item.source === "PHYSICIAN_CONFIRMED" ? <option value="PHYSICIAN_CONFIRMED">แพทย์ยืนยัน</option> : null}</select><input aria-label="รายละเอียด" placeholder="รายละเอียดสั้น ๆ" value={item.details} onChange={(event) => update(category, { details: event.target.value })} className={compactInputClass} /></div> : null}</div>;
    })}</div>}
  </div>;
}

function ImportantHistorySummary({ conditions, legacy }: { conditions: ImportantHearingCondition[]; legacy: boolean }) {
  if (legacy) return <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">ไม่มี snapshot ประวัติสำคัญใน record รุ่นเดิม</div>;
  if (conditions.length === 0) return <div className="rounded-lg border border-amber-200 bg-white/70 px-4 py-3 text-sm text-amber-900">ไม่พบประวัติการได้ยินสำคัญที่ active</div>;
  return <div className="grid gap-2 md:grid-cols-2">{conditions.map((item) => <div key={`${item.category}:${item.id ?? "new"}`} className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-sm"><p className="font-semibold text-amber-950">{importantCategoryLabel(item.category)}</p><p className="mt-1 leading-5 text-amber-800">{importantEarLabel(item.earScope)} · {importantOnsetLabel(item.onset)} · {importantSourceLabel(item.source)}{item.details ? ` · ${item.details}` : ""}</p></div>)}</div>;
}

function importantCategoryLabel(category: ImportantHearingCondition["category"]): string {
  return category === "PRE_EXISTING_HEARING_LOSS" ? "สูญเสียการได้ยิน/หูดับเดิม" : category === "PRE_EXISTING_HEARING_DISABILITY" ? "ความพิการทางการได้ยินเดิม" : "ประวัติการได้ยินสำคัญอื่น";
}
function importantEarLabel(value: ImportantHearingCondition["earScope"]): string { return value === "LEFT" ? "หูซ้าย" : value === "RIGHT" ? "หูขวา" : value === "BOTH" ? "สองข้าง" : "ไม่ทราบข้าง"; }
function importantOnsetLabel(value: ImportantHearingCondition["onset"]): string { return value === "CONGENITAL_OR_CHILDHOOD" ? "ตั้งแต่กำเนิด/วัยเด็ก" : value === "LATER" ? "เกิดภายหลัง" : "ไม่ทราบช่วงเริ่ม"; }
function importantSourceLabel(value: ImportantHearingCondition["source"]): string { return value === "PATIENT_OR_FAMILY" ? "ผู้ป่วย/ญาติแจ้ง" : value === "PRIOR_MEDICAL_RECORD" ? "เวชระเบียนเดิม" : "แพทย์ยืนยัน"; }

function EmploymentTransitionPanel({ summary, organizationId, value, onChange, onUseExisting }: {
  summary: HospitalPatientEmploymentSummary;
  organizationId: string;
  value: NewEmployee;
  onChange: (value: NewEmployee) => void;
  onUseExisting: (employeeId: string) => void;
}) {
  const existing = summary.employments.find((item) => item.organizationId === organizationId);
  const priorEmployments = summary.employments.filter((item) => item.organizationId !== organizationId);
  return <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 sm:p-5">
    <p className="text-sm font-semibold text-violet-950">พบ HN {summary.hospitalNumber} ในระบบแล้ว</p>
    {existing ? <div className="mt-3 rounded-lg bg-white p-3 text-sm text-violet-900">
      มี employee record ในบริษัทที่เลือกแล้ว: <strong>{existing.employeeNumber} · {existing.fullName}</strong>
      {existing.active ? <button type="button" onClick={() => onUseExisting(existing.employeeId)} className="hg-interactive hg-pressable ml-3 font-semibold text-teal-700 underline">ใช้รายชื่อนี้</button> : <span className="ml-2 text-amber-700">ระบบจะเปิด employment นี้อีกครั้งเมื่อบันทึก</span>}
    </div> : <>
      <p className="mt-2 text-sm leading-6 text-violet-800">HN นี้มีประวัติกับบริษัทอื่น กรุณาระบุว่าเป็นการย้ายงานหรือทำงานหลายบริษัทพร้อมกัน ข้อมูลตรวจเดิมจะไม่ถูกย้ายตามมา</p>
      {priorEmployments.length > 0 ? <Field label="Employment เดิมที่เกี่ยวข้อง"><select required value={value.priorEmployeeId} onChange={(event) => onChange({ ...value, priorEmployeeId: event.target.value })} className={inputClass}><option value="">เลือก employment เดิม</option>{priorEmployments.map((item) => <option key={item.employeeId} value={item.employeeId}>{item.organizationNameTh ?? item.organizationName} · {item.employeeNumber} · {item.active ? "Active" : "Ended"}</option>)}</select></Field> : null}
      {summary.hasHiddenEmployment ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">มี employment ในองค์กรที่บัญชีนี้ไม่มีสิทธิ์เปิดดู หากเลือกย้ายงาน ระบบจะส่งให้ Hospital Admin ทบทวนการปิด employment เดิม</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <QuickChoice active={value.transitionMode === "TRANSFER"} onClick={() => onChange({ ...value, transitionMode: "TRANSFER" })} title="ย้ายบริษัท" description="ปิดงานเดิมก่อนวันที่เริ่มบริษัทใหม่ หรือส่ง Admin review" />
        <QuickChoice active={value.transitionMode === "CONCURRENT"} onClick={() => onChange({ ...value, transitionMode: "CONCURRENT" })} title="ทำงานหลายบริษัท" description="เก็บ employment เดิมเป็น Active" />
      </div>
      <div className="mt-3 max-w-sm"><Field label="วันที่มีผล"><input required type="date" value={value.effectiveDate} onChange={(event) => onChange({ ...value, effectiveDate: event.target.value, employmentStartDate: event.target.value })} className={inputClass} /></Field></div>
    </>}
  </div>;
}

function historyLabel(code: PaperlessHistoryQuestionCode): string {
  return PAPERLESS_HISTORY_QUESTIONS.find((item) => item.code === code)?.label ?? code;
}

function formatThaiDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div>;
}
