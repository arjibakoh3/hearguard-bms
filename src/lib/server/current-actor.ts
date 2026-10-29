import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createDatabaseClient } from "@/infrastructure/postgres/server-client";

export type AppRole =
  | "HOSPITAL_ADMIN"
  | "OCCUPATIONAL_HEALTH_STAFF"
  | "OCCUPATIONAL_PHYSICIAN"
  | "COMPANY_USER";

export type CurrentActor = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  organizationIds: string[];
  physicianOrganizationIds: string[];
  canManage: boolean;
  canReviewBaseline: boolean;
};

const AccessRowSchema = z.object({
  role: z.enum([
    "HOSPITAL_ADMIN",
    "OCCUPATIONAL_HEALTH_STAFF",
    "OCCUPATIONAL_PHYSICIAN",
    "COMPANY_USER",
  ]),
  organization_id: z.string().uuid().nullable(),
  active: z.boolean(),
});

const ROLE_PRIORITY: Record<AppRole, number> = {
  HOSPITAL_ADMIN: 1,
  OCCUPATIONAL_PHYSICIAN: 2,
  OCCUPATIONAL_HEALTH_STAFF: 3,
  COMPANY_USER: 4,
};

export const getCurrentActor = cache(async (): Promise<CurrentActor | null> => {
  const client = await createDatabaseClient();
  const userResponse = await client.auth.getUser();
  const user = userResponse.data.user;
  if (userResponse.error || !user?.email) return null;

  const accessResponse = await client
    .from("user_organization_access")
    .select("role, organization_id, active")
    .eq("user_id", user.id)
    .eq("active", true);
  if (accessResponse.error) {
    throw new Error(`Unable to load current user access: ${accessResponse.error.message}`);
  }
  const accessRows = z.array(AccessRowSchema).parse(accessResponse.data ?? []);
  if (accessRows.length === 0) return null;
  const primary = [...accessRows].sort(
    (left, right) => ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role],
  )[0];
  const fullName = typeof user.user_metadata.full_name === "string"
    ? user.user_metadata.full_name.trim()
    : "";

  return {
    id: user.id,
    email: user.email,
    fullName: fullName || user.email,
    role: primary.role,
    organizationIds: accessRows.flatMap((access) =>
      access.organization_id ? [access.organization_id] : []),
    physicianOrganizationIds: accessRows.flatMap((access) =>
      access.role === "OCCUPATIONAL_PHYSICIAN" && access.organization_id
        ? [access.organization_id]
        : []),
    canManage:
      primary.role === "HOSPITAL_ADMIN"
      || primary.role === "OCCUPATIONAL_HEALTH_STAFF",
    canReviewBaseline: accessRows.some(
      (access) => access.role === "OCCUPATIONAL_PHYSICIAN",
    ),
  };
});

export async function requireCurrentActor(): Promise<CurrentActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function requireBaselineReviewer(): Promise<CurrentActor> {
  const actor = await requireCurrentActor();
  if (!actor.canReviewBaseline) redirect("/baseline-governance?denied=review");
  return actor;
}

export async function requireManagingActor(): Promise<CurrentActor> {
  const actor = await requireCurrentActor();
  if (!actor.canManage) redirect("/workspace?denied=manage");
  return actor;
}

export async function requireHospitalAdmin(): Promise<CurrentActor> {
  const actor = await requireCurrentActor();
  if (actor.role !== "HOSPITAL_ADMIN") redirect("/companies?denied=admin");
  return actor;
}

export async function requireHospitalClinicalActor(): Promise<CurrentActor> {
  const actor = await requireCurrentActor();
  if (actor.role === "COMPANY_USER") redirect("/workspace?denied=clinical");
  return actor;
}
