import type {
  AudiogramSearchCriteria,
  AudiogramSearchResult,
  DepartmentPopulationSummary,
  EmployeeAudiogramReport,
  EmployeeProfile,
  EmployeeSearchCriteria,
  EmployeeSearchResult,
  FollowUpCaseDetail,
  FollowUpSearchCriteria,
  FollowUpSearchResult,
  OrganizationAnalytics,
  OrganizationDetail,
  OrganizationListItem,
  PopulationDashboard,
  AuditLogDetail,
  AuditLogSearchCriteria,
  AuditLogSearchResult,
  BaselineGovernanceDetail,
  BaselineGovernanceSearchCriteria,
  BaselineGovernanceSearchResult,
} from "../view-models";

export interface HearGuardReadRepository {
  listOrganizations(): Promise<OrganizationListItem[]>;
  getOrganization(id: string): Promise<OrganizationDetail | null>;
  searchEmployees(criteria: EmployeeSearchCriteria): Promise<EmployeeSearchResult>;
  getEmployeeProfile(id: string): Promise<EmployeeProfile | null>;
  getEmployeeAudiogramReport(
    employeeId: string,
    audiogramId: string,
  ): Promise<EmployeeAudiogramReport | null>;
  searchAudiograms(criteria: AudiogramSearchCriteria): Promise<AudiogramSearchResult>;
  searchFollowUpCases(
    criteria: FollowUpSearchCriteria,
  ): Promise<FollowUpSearchResult>;
  getFollowUpCase(id: string): Promise<FollowUpCaseDetail | null>;
  getPopulationDashboard(): Promise<PopulationDashboard>;
  getOrganizationAnalytics(id: string): Promise<OrganizationAnalytics | null>;
  getDepartmentAnalytics(
    organizationId: string,
    departmentId: string,
  ): Promise<DepartmentPopulationSummary | null>;
  searchAuditLogs(criteria: AuditLogSearchCriteria): Promise<AuditLogSearchResult>;
  getAuditLog(id: string): Promise<AuditLogDetail | null>;
  searchBaselineGovernance(
    criteria: BaselineGovernanceSearchCriteria,
  ): Promise<BaselineGovernanceSearchResult>;
  getBaselineGovernanceSuggestion(id: string): Promise<BaselineGovernanceDetail | null>;
}
