export const AUDIT_ACTION_LABELS: Record<string, string> = {
  AUDIOGRAM_IMPORTED: "นำเข้า Audiogram",
  CSV_IMPORT_COMMITTED: "Commit แถว CSV",
  CSV_IMPORT_COMPLETED: "Import batch สำเร็จ",
  CSV_IMPORT_FAILED: "Import batch ล้มเหลว",
  FOLLOW_UP_STATUS_CHANGED: "เปลี่ยนสถานะ Follow-up",
  BASELINE_SUGGESTION_CREATED: "สร้างข้อเสนอ Baseline",
  BASELINE_REVISION_APPROVED: "แพทย์อนุมัติข้อเสนอ Baseline",
  BASELINE_REVISION_REJECTED: "แพทย์ไม่อนุมัติข้อเสนอ Baseline",
  BASELINE_REVIEW_DEFERRED: "แพทย์เลื่อนการตัดสินใจ Baseline",
  BASELINE_VERSION_ACTIVATED: "เปิดใช้ Baseline version",
  BASELINE_VERSION_SUPERSEDED: "แทนที่ Baseline version",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  audiogram: "Audiogram",
  import_batch: "Import batch",
  follow_up_case: "Follow-up case",
  baseline_interpretation_suggestion: "Baseline suggestion",
  hearing_baseline_history: "Baseline history",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType.replaceAll("_", " ");
}

export function actorRoleLabel(role: string | null): string {
  return role === "HOSPITAL_ADMIN"
    ? "Hospital admin"
    : role === "OCCUPATIONAL_HEALTH_STAFF"
      ? "OH staff"
      : role === "OCCUPATIONAL_PHYSICIAN"
        ? "Occupational physician"
      : role === "COMPANY_USER"
        ? "Company viewer"
        : "System";
}
