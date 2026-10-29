import type { HearGuardReadRepository } from "./ports/hearguard-read-repository";
import type {
  AudiogramSearchCriteria,
  EmployeeSearchCriteria,
  FollowUpQueueFilter,
  FollowUpSearchCriteria,
  AuditLogSearchCriteria,
  BaselineGovernanceSearchCriteria,
} from "./view-models";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function normalizePage(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizePageSize(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(value, MAX_PAGE_SIZE);
}

function normalizeQuery(value?: string): string | undefined {
  const normalized = value?.trim().replace(/[,%()]/g, "").slice(0, 80);
  return normalized || undefined;
}

export class HearGuardReadService {
  constructor(private readonly repository: HearGuardReadRepository) {}

  listOrganizations() {
    return this.repository.listOrganizations();
  }

  getOrganization(id: string) {
    return this.repository.getOrganization(id);
  }

  searchEmployees(criteria: Partial<EmployeeSearchCriteria>) {
    return this.repository.searchEmployees({
      query: normalizeQuery(criteria.query),
      organizationId: criteria.organizationId || undefined,
      departmentId: criteria.departmentId || undefined,
      clinicalResult: criteria.clinicalResult,
      followUpWorkflow: criteria.followUpWorkflow,
      page: normalizePage(criteria.page ?? 1),
      pageSize: normalizePageSize(criteria.pageSize ?? DEFAULT_PAGE_SIZE),
    });
  }

  getEmployeeProfile(id: string) {
    return this.repository.getEmployeeProfile(id);
  }

  getEmployeeAudiogramReport(employeeId: string, audiogramId: string) {
    return this.repository.getEmployeeAudiogramReport(employeeId, audiogramId);
  }

  searchAudiograms(criteria: Partial<AudiogramSearchCriteria>) {
    return this.repository.searchAudiograms({
      query: normalizeQuery(criteria.query),
      organizationId: criteria.organizationId || undefined,
      examType: criteria.examType || undefined,
      year: criteria.year,
      page: normalizePage(criteria.page ?? 1),
      pageSize: normalizePageSize(criteria.pageSize ?? DEFAULT_PAGE_SIZE),
    });
  }

  searchFollowUpCases(criteria: Partial<FollowUpSearchCriteria>) {
    const filter: FollowUpQueueFilter = criteria.filter ?? "ALL_OPEN";

    return this.repository.searchFollowUpCases({
      query: normalizeQuery(criteria.query),
      organizationId: criteria.organizationId || undefined,
      filter,
      page: normalizePage(criteria.page ?? 1),
      pageSize: normalizePageSize(criteria.pageSize ?? DEFAULT_PAGE_SIZE),
    });
  }

  getFollowUpCase(id: string) {
    return this.repository.getFollowUpCase(id);
  }

  getPopulationDashboard() {
    return this.repository.getPopulationDashboard();
  }

  getOrganizationAnalytics(id: string) {
    return this.repository.getOrganizationAnalytics(id);
  }

  getDepartmentAnalytics(organizationId: string, departmentId: string) {
    return this.repository.getDepartmentAnalytics(organizationId, departmentId);
  }

  searchAuditLogs(criteria: Partial<AuditLogSearchCriteria>) {
    return this.repository.searchAuditLogs({
      query: normalizeQuery(criteria.query),
      organizationId: criteria.organizationId || undefined,
      action: normalizeQuery(criteria.action),
      entityType: normalizeQuery(criteria.entityType),
      page: normalizePage(criteria.page ?? 1),
      pageSize: normalizePageSize(criteria.pageSize ?? DEFAULT_PAGE_SIZE),
    });
  }

  getAuditLog(id: string) {
    return this.repository.getAuditLog(id);
  }

  searchBaselineGovernance(criteria: Partial<BaselineGovernanceSearchCriteria>) {
    return this.repository.searchBaselineGovernance({
      query: normalizeQuery(criteria.query),
      organizationId: criteria.organizationId || undefined,
      framework: criteria.framework,
      reviewStatus: criteria.reviewStatus,
      page: normalizePage(criteria.page ?? 1),
      pageSize: normalizePageSize(criteria.pageSize ?? DEFAULT_PAGE_SIZE),
    });
  }

  getBaselineGovernanceSuggestion(id: string) {
    return this.repository.getBaselineGovernanceSuggestion(id);
  }
}
