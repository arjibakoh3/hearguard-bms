import "server-only";

import { z } from "zod";
import type {
  HearingProtectionEmployeeContext,
  HearingProtectorCatalogInput,
  PersistHearingProtectionAssignment,
} from "@/application/hearing-protection-models";
import type { HearingProtectionRepository } from "@/application/ports/hearing-protection-repository";
import type { HearingProtectorSummary } from "@/application/view-models";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

const DatabaseNumberSchema = z.union([
  z.number(),
  z.string().transform((value) => Number(value)),
]);
const NullableDatabaseNumberSchema = DatabaseNumberSchema.nullable();

const ProtectorRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  manufacturer: z.string(),
  model: z.string(),
  protector_type: z.enum(["EARMUFF", "FOAM_EARPLUG", "OTHER_EARPLUG"]),
  nrr_db: NullableDatabaseNumberSchema,
  snr_db: NullableDatabaseNumberSchema,
  active: z.boolean(),
  notes: z.string().nullable(),
});

const EmployeeRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
});

const ExposureRowSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  measurement_date: z.string(),
  twa_db_a: NullableDatabaseNumberSchema,
  twa_db_c: NullableDatabaseNumberSchema,
  shift_hours: NullableDatabaseNumberSchema,
  exposure_basis: z.enum(["EIGHT_HOUR_TWA", "SHIFT_AVERAGE", "UNSPECIFIED"]),
});

function mapProtector(row: z.infer<typeof ProtectorRowSchema>): HearingProtectorSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    manufacturer: row.manufacturer,
    model: row.model,
    protectorType: row.protector_type,
    nrrDb: row.nrr_db,
    snrDb: row.snr_db,
    active: row.active,
    notes: row.notes,
  };
}

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export class SupabaseHearingProtectionRepository
  implements HearingProtectionRepository
{
  async listOrganizationProtectors(
    organizationId: string,
  ): Promise<HearingProtectorSummary[]> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("hearing_protectors")
      .select("id,organization_id,manufacturer,model,protector_type,nrr_db,snr_db,active,notes")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("manufacturer")
      .order("model");
    assertNoError(response.error, "Unable to load hearing protector catalog");
    return z.array(ProtectorRowSchema).parse(response.data ?? []).map(mapProtector);
  }

  async upsertProtector(input: HearingProtectorCatalogInput): Promise<string> {
    const client = await createSupabaseServerClient();
    const payload = {
      organization_id: input.organizationId,
      manufacturer: input.manufacturer,
      model: input.model,
      protector_type: input.protectorType,
      nrr_db: input.nrrDb,
      snr_db: input.snrDb,
      active: input.active,
      notes: input.notes,
    };
    const response = input.id
      ? await client
          .from("hearing_protectors")
          .update(payload)
          .eq("id", input.id)
          .eq("organization_id", input.organizationId)
          .select("id")
          .single()
      : await client
          .from("hearing_protectors")
          .insert(payload)
          .select("id")
          .single();
    assertNoError(response.error, "Unable to save hearing protector");
    return z.object({ id: z.string().uuid() }).parse(response.data).id;
  }

  async getEmployeeContext(
    employeeId: string,
  ): Promise<HearingProtectionEmployeeContext | null> {
    const client = await createSupabaseServerClient();
    const employeeResponse = await client
      .from("employees")
      .select("id,organization_id,department_id")
      .eq("id", employeeId)
      .maybeSingle();
    assertNoError(employeeResponse.error, "Unable to load employee hearing protection context");
    if (!employeeResponse.data) return null;
    const employee = EmployeeRowSchema.parse(employeeResponse.data);

    const employeeExposureQuery = client
      .from("noise_exposures")
      .select("id,employee_id,measurement_date,twa_db_a,twa_db_c,shift_hours,exposure_basis")
      .eq("organization_id", employee.organization_id)
      .eq("employee_id", employee.id)
      .order("measurement_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const departmentExposureQuery = employee.department_id
      ? client
          .from("noise_exposures")
          .select("id,employee_id,measurement_date,twa_db_a,twa_db_c,shift_hours,exposure_basis")
          .eq("organization_id", employee.organization_id)
          .eq("department_id", employee.department_id)
          .is("employee_id", null)
          .order("measurement_date", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

    const [protectors, employeeExposureResponse, departmentExposureResponse] = await Promise.all([
      this.listOrganizationProtectors(employee.organization_id),
      employeeExposureQuery,
      departmentExposureQuery,
    ]);
    assertNoError(employeeExposureResponse.error, "Unable to load employee noise exposure");
    assertNoError(departmentExposureResponse.error, "Unable to load department noise exposure");
    const employeeExposure = employeeExposureResponse.data
      ? ExposureRowSchema.parse(employeeExposureResponse.data)
      : null;
    const departmentExposure = departmentExposureResponse.data
      ? ExposureRowSchema.parse(departmentExposureResponse.data)
      : null;
    const latestExposure = !employeeExposure
      ? departmentExposure
      : !departmentExposure
        ? employeeExposure
        : employeeExposure.measurement_date >= departmentExposure.measurement_date
          ? employeeExposure
          : departmentExposure;

    return {
      employeeId: employee.id,
      organizationId: employee.organization_id,
      exposure: latestExposure
        ? {
            id: latestExposure.id,
            measurementDate: latestExposure.measurement_date,
            scope: latestExposure.employee_id ? "EMPLOYEE" : "DEPARTMENT",
            levelDbA: latestExposure.twa_db_a,
            levelDbC: latestExposure.twa_db_c,
            shiftHours: latestExposure.shift_hours,
            basis: latestExposure.exposure_basis,
          }
        : null,
      protectors: protectors
        .filter((protector) => protector.active)
        .map((protector) => ({
          id: protector.id,
          manufacturer: protector.manufacturer,
          model: protector.model,
          protectorType: protector.protectorType,
          nrrDb: protector.nrrDb,
          snrDb: protector.snrDb,
        })),
    };
  }

  async assignAndRecordAssessment(
    command: PersistHearingProtectionAssignment,
  ): Promise<{ assignmentId: string; assessmentId: string }> {
    const client = await createSupabaseServerClient();
    const response = await client.rpc(
      "assign_hearing_protector_and_record_assessment",
      {
        p_employee_id: command.input.employeeId,
        p_hearing_protector_id: command.input.hearingProtectorId,
        p_secondary_hearing_protector_id: command.input.secondaryHearingProtectorId,
        p_configuration: command.input.configuration,
        p_effective_from: command.input.effectiveFrom,
        p_notes: command.input.notes,
        p_noise_exposure_id: command.exposureId,
        p_status: command.assessment.status,
        p_protected_exposure_db_a: command.assessment.protectedExposureDbA,
        p_allowable_exposure_db_a: command.assessment.allowableExposureDbA,
        p_protection_margin_db: command.assessment.protectionMarginDb,
        p_governing_method: command.assessment.governingMethod,
        p_rule_code: command.assessment.ruleCode,
        p_rule_version: command.assessment.ruleVersion,
        p_input_snapshot_json: command.inputSnapshot,
        p_calculations_json: command.assessment.calculations,
        p_reasons_json: command.assessment.reasons,
        p_assessed_at: command.assessment.assessedAt,
      },
    );
    assertNoError(response.error, "Unable to assign hearing protector");
    const result = z.object({
      assignmentId: z.string().uuid(),
      assessmentId: z.string().uuid(),
    }).parse(response.data);
    return result;
  }
}
