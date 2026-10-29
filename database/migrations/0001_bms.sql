-- Initial BMS PostgreSQL schema. No clinical records, demo identities or accounts.
-- Source: HearGuard defe5bd7ac909f3dce5159a1b4637a9a47d723e4.
-- Existing rule functions, immutable snapshots, RLS and audit transactions are retained.
create schema if not exists extensions;
create schema auth;
create schema hearguard_auth;
create table auth.users (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 raw_user_meta_data jsonb not null default '{}'::jsonb,
 encrypted_password text not null, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(auth.jwt()->>'sub','')::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select coalesce(auth.jwt()->>'role','anon')
$$;


-- 20260811000000_initial_schema.sql

-- HearGuard initial schema
-- Raw audiometry is relational and immutable-by-convention; evaluated results
-- retain their rule version and baseline references for later audit.

create extension if not exists pgcrypto with schema extensions;
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_th text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint departments_organization_code_unique unique (organization_id, code),
  constraint departments_id_organization_unique unique (id, organization_id),
  constraint departments_code_not_blank check (btrim(code) <> '')
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  department_id uuid,
  employee_number text not null,
  national_identifier text,
  first_name text not null,
  last_name text not null,
  sex text,
  date_of_birth date,
  job_title text,
  employment_start_date date,
  employment_end_date date,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint employees_organization_number_unique unique (organization_id, employee_number),
  constraint employees_id_organization_unique unique (id, organization_id),
  constraint employees_department_same_organization
    foreign key (department_id, organization_id)
    references public.departments(id, organization_id) on delete restrict,
  constraint employees_number_not_blank check (btrim(employee_number) <> ''),
  constraint employees_sex_valid check (sex is null or sex in ('FEMALE', 'MALE', 'OTHER', 'UNSPECIFIED')),
  constraint employees_employment_dates_valid check (
    employment_end_date is null
    or employment_start_date is null
    or employment_end_date >= employment_start_date
  )
);
create table public.noise_exposures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  department_id uuid,
  employee_id uuid,
  job_title text,
  measurement_date date not null,
  twa_db_a numeric(5, 1),
  lel_db_a numeric(5, 1),
  peak_db numeric(5, 1),
  shift_hours numeric(4, 1),
  measurement_method text,
  instrument text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint noise_exposure_department_same_organization
    foreign key (department_id, organization_id)
    references public.departments(id, organization_id) on delete restrict,
  constraint noise_exposure_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint noise_exposure_at_least_one_measurement check (
    twa_db_a is not null or lel_db_a is not null or peak_db is not null
  ),
  constraint noise_exposure_shift_hours_valid check (
    shift_hours is null or shift_hours > 0
  )
);
create table public.audiograms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  exam_date date not null,
  exam_type text not null,
  test_context text,
  hours_since_noise_exposure numeric(5, 1),
  audiometer_model text,
  audiometer_serial text,
  calibration_date date,
  examiner text,
  location text,
  is_valid boolean not null default true,
  validation_notes text,
  import_batch_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint audiograms_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint audiograms_id_employee_organization_unique unique (id, employee_id, organization_id),
  constraint audiograms_natural_key unique (employee_id, exam_date, exam_type),
  constraint audiograms_exam_type_valid check (
    exam_type in ('BASELINE', 'ANNUAL', 'REPEAT', 'CONFIRMATION', 'OTHER')
  ),
  constraint audiograms_noise_free_hours_valid check (
    hours_since_noise_exposure is null
    or hours_since_noise_exposure between 0 and 168
  ),
  constraint audiograms_validation_note_required check (
    is_valid or nullif(btrim(validation_notes), '') is not null
  )
);
create table public.audiogram_thresholds (
  id uuid primary key default gen_random_uuid(),
  audiogram_id uuid not null references public.audiograms(id) on delete cascade,
  ear text not null,
  frequency_hz integer not null,
  threshold_db_hl numeric(5, 1) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audiogram_threshold_point_unique unique (audiogram_id, ear, frequency_hz),
  constraint audiogram_threshold_ear_valid check (ear in ('LEFT', 'RIGHT')),
  constraint audiogram_threshold_frequency_valid check (
    frequency_hz in (500, 1000, 2000, 3000, 4000, 6000, 8000)
  ),
  constraint audiogram_threshold_range_valid check (threshold_db_hl between -20 and 140)
);
create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  version text not null,
  jurisdiction text not null,
  effective_date date,
  status text not null,
  reference_title text not null,
  reference_url text,
  notes text,
  configuration_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rule_sets_code_version_unique unique (code, version),
  constraint rule_sets_id_version_unique unique (id, version),
  constraint rule_sets_status_valid check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  constraint rule_sets_configuration_object check (jsonb_typeof(configuration_json) = 'object')
);
create table public.hearing_baseline_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  baseline_audiogram_id uuid not null,
  ear_scope text not null default 'BOTH',
  framework_or_context text not null default 'THAI_OPERATIONAL',
  status text not null,
  reason_code text not null,
  reason_text text,
  source_suggestion_id uuid,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint baseline_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint baseline_audiogram_same_employee
    foreign key (baseline_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint baseline_ear_scope_valid check (ear_scope in ('LEFT', 'RIGHT', 'BOTH')),
  constraint baseline_status_valid check (status in ('ACTIVE', 'SUPERSEDED', 'REJECTED')),
  constraint baseline_effective_dates_valid check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint baseline_approval_consistent check (
    (approved_by is null and approved_at is null)
    or approved_at is not null
  )
);
create unique index hearing_baseline_one_active_per_context_idx
  on public.hearing_baseline_history (employee_id, ear_scope, framework_or_context)
  where status = 'ACTIVE';
create table public.surveillance_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  current_audiogram_id uuid not null,
  baseline_audiogram_id uuid,
  baseline_history_id uuid references public.hearing_baseline_history(id) on delete restrict,
  rule_set_id uuid not null,
  rule_version text not null,
  status text not null,
  evaluation_result_json jsonb not null,
  analysis_mode text not null default 'PROSPECTIVE',
  supersedes_evaluation_id uuid references public.surveillance_evaluations(id) on delete restrict,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint surveillance_evaluation_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint surveillance_current_audiogram_same_employee
    foreign key (current_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint surveillance_baseline_audiogram_same_employee
    foreign key (baseline_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint surveillance_rule_version_exact
    foreign key (rule_set_id, rule_version)
    references public.rule_sets(id, version) on delete restrict,
  constraint surveillance_evaluation_id_scope_unique unique (id, organization_id, employee_id),
  constraint surveillance_status_valid check (status in ('NEGATIVE', 'POSITIVE', 'NOT_EVALUABLE')),
  constraint surveillance_analysis_mode_valid check (
    analysis_mode in ('PROSPECTIVE', 'RETROSPECTIVE_REANALYSIS')
  ),
  constraint surveillance_result_object check (jsonb_typeof(evaluation_result_json) = 'object'),
  constraint surveillance_reanalysis_link_valid check (
    analysis_mode = 'RETROSPECTIVE_REANALYSIS' or supersedes_evaluation_id is null
  )
);
create table public.follow_up_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  trigger_evaluation_id uuid not null unique,
  status text not null,
  priority text,
  detected_date date not null,
  repeat_due_date date,
  repeat_completed_date date,
  physician_review_date date,
  intervention_required boolean not null default false,
  intervention_notes text,
  follow_up_date date,
  closed_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint follow_up_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint follow_up_trigger_same_scope
    foreign key (trigger_evaluation_id, organization_id, employee_id)
    references public.surveillance_evaluations(id, organization_id, employee_id) on delete restrict,
  constraint follow_up_status_valid check (
    status in (
      'SHIFT_DETECTED',
      'REPEAT_REQUIRED',
      'REPEAT_COMPLETED',
      'PHYSICIAN_REVIEW',
      'INTERVENTION_REQUIRED',
      'FOLLOW_UP',
      'CLOSED'
    )
  ),
  constraint follow_up_priority_valid check (
    priority is null or priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ),
  constraint follow_up_repeat_due_valid check (
    repeat_due_date is null or repeat_due_date >= detected_date
  ),
  constraint follow_up_closed_state_consistent check (
    (status = 'CLOSED' and closed_date is not null)
    or (status <> 'CLOSED' and closed_date is null)
  )
);
create or replace function public.enforce_follow_up_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'SHIFT_DETECTED' and new.status = 'REPEAT_REQUIRED')
    or (old.status = 'REPEAT_REQUIRED' and new.status = 'REPEAT_COMPLETED')
    or (old.status = 'REPEAT_COMPLETED' and new.status = 'PHYSICIAN_REVIEW')
    or (old.status = 'PHYSICIAN_REVIEW' and new.status in ('INTERVENTION_REQUIRED', 'FOLLOW_UP', 'CLOSED'))
    or (old.status = 'INTERVENTION_REQUIRED' and new.status in ('FOLLOW_UP', 'CLOSED'))
    or (old.status = 'FOLLOW_UP' and new.status in ('PHYSICIAN_REVIEW', 'CLOSED'))
  ) then
    raise exception 'Invalid follow-up case transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;
create trigger follow_up_cases_enforce_transition
before update of status on public.follow_up_cases
for each row execute function public.enforce_follow_up_transition();
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  filename text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  status text not null,
  rows_total integer not null default 0,
  rows_success integer not null default 0,
  rows_warning integer not null default 0,
  rows_failed integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint import_batches_filename_not_blank check (btrim(filename) <> ''),
  constraint import_batches_status_valid check (
    status in ('UPLOADED', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')
  ),
  constraint import_batches_counts_nonnegative check (
    rows_total >= 0 and rows_success >= 0 and rows_warning >= 0 and rows_failed >= 0
  )
);
alter table public.audiograms
  add constraint audiograms_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id) on delete set null;
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_values_json jsonb,
  new_values_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_action_not_blank check (btrim(action) <> ''),
  constraint audit_old_values_object check (
    old_values_json is null or jsonb_typeof(old_values_json) = 'object'
  ),
  constraint audit_new_values_object check (
    new_values_json is null or jsonb_typeof(new_values_json) = 'object'
  )
);
create table public.user_organization_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_organization_access_unique unique nulls not distinct (user_id, organization_id, role),
  constraint user_organization_access_role_valid check (
    role in ('HOSPITAL_ADMIN', 'OCCUPATIONAL_HEALTH_STAFF', 'COMPANY_USER')
  ),
  constraint user_organization_access_scope_valid check (
    (role = 'HOSPITAL_ADMIN' and organization_id is null)
    or (role <> 'HOSPITAL_ADMIN' and organization_id is not null)
  )
);
create or replace function public.can_access_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and (
        access.role = 'HOSPITAL_ADMIN'
        or access.organization_id = target_organization_id
      )
  );
$$;
create index departments_organization_idx on public.departments (organization_id);
create index employees_organization_idx on public.employees (organization_id);
create index employees_department_idx on public.employees (department_id) where active;
create index employees_name_search_idx on public.employees (organization_id, last_name, first_name);
create index noise_exposures_organization_date_idx on public.noise_exposures (organization_id, measurement_date desc);
create index noise_exposures_department_date_idx on public.noise_exposures (department_id, measurement_date desc);
create index audiograms_employee_date_idx on public.audiograms (employee_id, exam_date desc);
create index audiograms_organization_date_idx on public.audiograms (organization_id, exam_date desc);
create index audiogram_thresholds_audiogram_idx on public.audiogram_thresholds (audiogram_id, ear, frequency_hz);
create index surveillance_employee_date_idx on public.surveillance_evaluations (employee_id, evaluated_at desc);
create index surveillance_organization_status_idx on public.surveillance_evaluations (organization_id, status, evaluated_at desc);
create index follow_up_work_queue_idx on public.follow_up_cases (organization_id, status, repeat_due_date);
create index follow_up_overdue_idx on public.follow_up_cases (repeat_due_date)
  where status = 'REPEAT_REQUIRED';
create index import_batches_organization_uploaded_idx on public.import_batches (organization_id, uploaded_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_organization_idx on public.audit_logs (organization_id, created_at desc);
create index user_organization_access_user_idx on public.user_organization_access (user_id) where active;
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'departments',
    'employees',
    'noise_exposures',
    'audiograms',
    'rule_sets',
    'hearing_baseline_history',
    'follow_up_cases',
    'import_batches',
    'user_organization_access'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;
alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.noise_exposures enable row level security;
alter table public.audiograms enable row level security;
alter table public.audiogram_thresholds enable row level security;
alter table public.rule_sets enable row level security;
alter table public.hearing_baseline_history enable row level security;
alter table public.surveillance_evaluations enable row level security;
alter table public.follow_up_cases enable row level security;
alter table public.import_batches enable row level security;
alter table public.audit_logs enable row level security;
alter table public.user_organization_access enable row level security;
create policy organizations_by_membership
on public.organizations for all to public
using (public.can_access_organization(id))
with check (public.can_access_organization(id));
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments',
    'employees',
    'noise_exposures',
    'audiograms',
    'hearing_baseline_history',
    'follow_up_cases',
    'import_batches'
  ]
  loop
    execute format(
      'create policy %I_by_membership on public.%I for all to public using (public.can_access_organization(organization_id)) with check (public.can_access_organization(organization_id))',
      table_name,
      table_name
    );
  end loop;
end;
$$;
create policy surveillance_evaluations_by_membership_read
on public.surveillance_evaluations for select to public
using (public.can_access_organization(organization_id));
create policy surveillance_evaluations_by_membership_insert
on public.surveillance_evaluations for insert to public
with check (public.can_access_organization(organization_id));
create policy audit_logs_by_membership_read
on public.audit_logs for select to public
using (public.can_access_organization(organization_id));
create policy audit_logs_by_membership_insert
on public.audit_logs for insert to public
with check (public.can_access_organization(organization_id));
create policy audiogram_thresholds_by_audiogram_membership
on public.audiogram_thresholds for all to public
using (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
);
create policy rule_sets_authenticated_read
on public.rule_sets for select to public
using (true);
create policy user_organization_access_self_read
on public.user_organization_access for select to public
using (user_id = (select auth.uid()));
comment on table public.audiogram_thresholds is
  'Normalized raw hearing thresholds. Never replace these values because a rule changes.';
comment on table public.surveillance_evaluations is
  'Immutable-by-convention evaluation snapshots tied to exact rule and baseline versions.';
comment on table public.hearing_baseline_history is
  'Versioned, physician-governed operational baseline designations.';
insert into public.rule_sets (id, code, name, version, jurisdiction, effective_date, status, reference_title, reference_url, notes, configuration_json, created_at, updated_at) values ('ef11a071-dd0a-4b95-9f72-2ddedf2f9052','THAI_HEARING_2561','Thai Hearing Surveillance Rule 2561','1.0.0','Thailand',NULL,'ACTIVE','REFERENCE_METADATA_PENDING_VERIFICATION',NULL,'Implementation metadata must be reviewed against an authoritative repository source by an occupational physician before production use.','{"ears": ["LEFT", "RIGHT"], "comparison": "CURRENT_MINUS_OPERATIONAL_BASELINE", "frequenciesHz": [500, 1000, 2000, 3000, 4000, 6000, 8000], "repeatDueDays": 30, "thresholdShiftDb": 15}','2026-08-13 04:19:20.59809+00','2026-08-13 04:19:20.59809+00');
insert into public.rule_sets (id, code, name, version, jurisdiction, effective_date, status, reference_title, reference_url, notes, configuration_json, created_at, updated_at) values ('e5336954-4c20-4d8a-888c-65d72d7b0408','OSHA_STS_29_CFR_1910_95','OSHA Standard Threshold Shift Comparator','0.1.0','United States',NULL,'DRAFT','29 CFR 1910.95 Occupational Noise Exposure','https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95','Independent analytical comparator only. Age correction and regulatory recordability are not implemented. It must not alter the Thai operational baseline or create Thai follow-up cases.','{"ears": ["LEFT", "RIGHT"], "comparison": "CURRENT_MINUS_OPERATIONAL_BASELINE", "frequenciesHz": [2000, 3000, 4000], "operationalWorkflow": false, "averageThresholdShiftDb": 10}','2026-08-13 04:19:20.59809+00','2026-08-13 04:19:20.59809+00');
insert into public.rule_sets (id, code, name, version, jurisdiction, effective_date, status, reference_title, reference_url, notes, configuration_json, created_at, updated_at) values ('d277dda4-f7a5-4220-89cd-a42dba4cdfd4','NIOSH_PERSISTENCE_ANALYSIS','NIOSH Retest and Confirmation Analysis','0.2.0','United States',NULL,'DRAFT','NIOSH Criteria for a Recommended Standard: Occupational Noise Exposure and CDC hearing monitoring guidance','https://www.cdc.gov/niosh/noise/prevent/understand.html','Decision-support suggestion layer only. It is not persisted as an operational surveillance evaluation and cannot change the Thai baseline or follow-up case.','{"sequence": ["MONITORING", "IMMEDIATE_RETEST", "QUIET_PERIOD_CONFIRMATION"], "frequenciesHz": [500, 1000, 2000, 3000, 4000, 6000], "thresholdShiftDb": 15, "confirmationDueDays": 30, "operationalWorkflow": false, "automaticBaselineChange": false, "immediateRetestOptional": true, "confirmationQuietHoursMinimum": 12}','2026-08-13 04:19:20.59809+00','2026-08-13 04:19:20.59809+00');
insert into public.rule_sets (id, code, name, version, jurisdiction, effective_date, status, reference_title, reference_url, notes, configuration_json, created_at, updated_at) values ('6b96ef3e-a456-40b7-891a-944f585d8abb','NIHL_EVIDENCE_PROFILE','NIHL evidence profile (suggestion only)','1.0.0','CLINICAL_EVIDENCE_SUPPORT','2026-09-02','ACTIVE','NIOSH Occupational Noise Exposure Criteria and ACOEM Occupational Noise-Induced Hearing Loss guidance','https://www.cdc.gov/niosh/docs/98-126/default.html','Non-diagnostic evidence organization only. Does not implement ISO 1999 NIPTS estimation, age correction, causal apportionment, or an automatic diagnosis.','{"references": [{"url": "https://www.cdc.gov/niosh/docs/98-126/default.html", "title": "NIOSH Criteria for a Recommended Standard: Occupational Noise Exposure"}, {"url": "https://acoem.org/Guidance-and-Position-Statements/Guidance-and-Position-Statements/Occupational-Noise-Induced-Hearing-Loss", "title": "ACOEM Occupational Noise-Induced Hearing Loss"}, {"url": "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95", "title": "OSHA Occupational Noise Exposure"}], "notchDetectors": ["COLeskyBroadNotch", "FOUR_KHZ_SPECIFIC"], "nioshCriterionDbA": 85, "automaticDiagnosis": false, "nioshCriterionHours": 8, "nioshExchangeRateDb": 3, "thaiFollowUpMutation": false, "automaticBaselineChange": false, "notchIndependentFromThresholdShift": true}','2026-09-02 03:07:18.352326+00','2026-09-02 03:07:18.352326+00');

-- 20260811010000_phase3_read_models.sql

-- Phase 3 read models keep list pages efficient and clinical calculations out
-- of presentation components. security_invoker preserves underlying RLS.

create or replace view public.organization_directory
with (security_invoker = true)
as
select
  organization.id,
  organization.code,
  organization.name,
  organization.name_th,
  organization.active,
  (
    select count(*)::integer
    from public.departments department
    where department.organization_id = organization.id
      and department.active
  ) as department_count,
  (
    select count(*)::integer
    from public.employees employee
    where employee.organization_id = organization.id
      and employee.active
  ) as active_employee_count,
  (
    select max(audiogram.exam_date)
    from public.audiograms audiogram
    where audiogram.organization_id = organization.id
      and audiogram.is_valid
  ) as latest_audiogram_date
from public.organizations organization;
create or replace view public.department_directory
with (security_invoker = true)
as
select
  department.id,
  department.organization_id,
  department.code,
  department.name,
  department.active,
  (
    select count(*)::integer
    from public.employees employee
    where employee.department_id = department.id
      and employee.active
  ) as active_employee_count,
  latest_exposure.measurement_date as latest_exposure_date,
  latest_exposure.twa_db_a as latest_twa_db_a,
  latest_exposure.peak_db as latest_peak_db
from public.departments department
left join lateral (
  select
    exposure.measurement_date,
    exposure.twa_db_a,
    exposure.peak_db
  from public.noise_exposures exposure
  where exposure.department_id = department.id
  order by exposure.measurement_date desc, exposure.created_at desc
  limit 1
) latest_exposure on true;
create or replace view public.employee_directory
with (security_invoker = true)
as
select
  employee.id,
  employee.organization_id,
  employee.department_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.job_title,
  employee.active,
  organization.name as organization_name,
  organization.code as organization_code,
  department.name as department_name,
  latest_audiogram.exam_date as latest_audiogram_date,
  latest_evaluation.status as latest_evaluation_status,
  latest_case.status as follow_up_status,
  latest_case.repeat_due_date,
  case
    when latest_case.status is not null then latest_case.status
    when latest_evaluation.status = 'POSITIVE' then 'SHIFT_DETECTED'
    when latest_evaluation.status = 'NOT_EVALUABLE' then 'NOT_EVALUABLE'
    else 'STABLE'
  end as surveillance_status
from public.employees employee
join public.organizations organization
  on organization.id = employee.organization_id
left join public.departments department
  on department.id = employee.department_id
left join lateral (
  select audiogram.exam_date
  from public.audiograms audiogram
  where audiogram.employee_id = employee.id
    and audiogram.is_valid
  order by audiogram.exam_date desc, audiogram.created_at desc
  limit 1
) latest_audiogram on true
left join lateral (
  select evaluation.status
  from public.surveillance_evaluations evaluation
  where evaluation.employee_id = employee.id
  order by evaluation.evaluated_at desc, evaluation.created_at desc
  limit 1
) latest_evaluation on true
left join lateral (
  select follow_up.status, follow_up.repeat_due_date
  from public.follow_up_cases follow_up
  where follow_up.employee_id = employee.id
  order by
    case when follow_up.status = 'CLOSED' then 1 else 0 end,
    follow_up.updated_at desc
  limit 1
) latest_case on true;
create or replace view public.audiogram_directory
with (security_invoker = true)
as
select
  audiogram.id,
  audiogram.organization_id,
  audiogram.employee_id,
  audiogram.exam_date,
  audiogram.exam_type,
  audiogram.is_valid,
  audiogram.validation_notes,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.department_id,
  organization.name as organization_name,
  department.name as department_name,
  (
    select count(*)::integer
    from public.audiogram_thresholds threshold
    where threshold.audiogram_id = audiogram.id
  ) as threshold_count
from public.audiograms audiogram
join public.employees employee
  on employee.id = audiogram.employee_id
join public.organizations organization
  on organization.id = audiogram.organization_id
left join public.departments department
  on department.id = employee.department_id;
create or replace view public.audiogram_year_directory
with (security_invoker = true)
as
select distinct
  audiogram.organization_id,
  extract(year from audiogram.exam_date)::integer as exam_year
from public.audiograms audiogram;
comment on view public.organization_directory is
  'Phase 3 organization listing with non-clinical aggregate counts.';
comment on view public.employee_directory is
  'Phase 3 employee listing with latest surveillance workflow state.';
comment on view public.audiogram_directory is
  'Phase 3 audiogram listing; raw threshold points remain relational.';

-- 20260811020000_phase4_surveillance.sql

-- Phase 4 surveillance work queue and auditable workflow mutation.
-- The Thai operational evaluation remains the only source of automatic cases;
-- OSHA/NIOSH results are independent analytical views.

create or replace view public.employee_directory
with (security_invoker = true)
as
select
  employee.id,
  employee.organization_id,
  employee.department_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.job_title,
  employee.active,
  organization.name as organization_name,
  organization.code as organization_code,
  department.name as department_name,
  latest_audiogram.exam_date as latest_audiogram_date,
  latest_evaluation.status as latest_evaluation_status,
  latest_case.status as follow_up_status,
  latest_case.repeat_due_date,
  case
    when latest_case.status is not null then latest_case.status
    when latest_evaluation.status = 'POSITIVE' then 'SHIFT_DETECTED'
    when latest_evaluation.status = 'NOT_EVALUABLE' then 'NOT_EVALUABLE'
    else 'STABLE'
  end as surveillance_status
from public.employees employee
join public.organizations organization
  on organization.id = employee.organization_id
left join public.departments department
  on department.id = employee.department_id
left join lateral (
  select audiogram.exam_date
  from public.audiograms audiogram
  where audiogram.employee_id = employee.id
    and audiogram.is_valid
  order by audiogram.exam_date desc, audiogram.created_at desc
  limit 1
) latest_audiogram on true
left join lateral (
  select evaluation.status
  from public.surveillance_evaluations evaluation
  join public.rule_sets rule_set
    on rule_set.id = evaluation.rule_set_id
   and rule_set.version = evaluation.rule_version
  where evaluation.employee_id = employee.id
    and rule_set.code = 'THAI_HEARING_2561'
  order by evaluation.evaluated_at desc, evaluation.created_at desc
  limit 1
) latest_evaluation on true
left join lateral (
  select follow_up.status, follow_up.repeat_due_date
  from public.follow_up_cases follow_up
  where follow_up.employee_id = employee.id
  order by
    case when follow_up.status = 'CLOSED' then 1 else 0 end,
    follow_up.updated_at desc
  limit 1
) latest_case on true;
create or replace view public.follow_up_queue
with (security_invoker = true)
as
select
  follow_up.id,
  follow_up.organization_id,
  follow_up.employee_id,
  follow_up.trigger_evaluation_id,
  evaluation.current_audiogram_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  organization.name as organization_name,
  department.name as department_name,
  rule_set.code as rule_code,
  rule_set.name as rule_name,
  evaluation.rule_version,
  evaluation.status as evaluation_status,
  evaluation.evaluation_result_json,
  evaluation.evaluated_at,
  follow_up.status,
  follow_up.priority,
  follow_up.detected_date,
  follow_up.repeat_due_date,
  follow_up.repeat_completed_date,
  follow_up.physician_review_date,
  follow_up.intervention_required,
  follow_up.intervention_notes,
  follow_up.follow_up_date,
  follow_up.closed_date,
  follow_up.assigned_to,
  follow_up.created_at,
  follow_up.updated_at,
  (
    follow_up.status in ('SHIFT_DETECTED', 'REPEAT_REQUIRED')
    and follow_up.repeat_due_date < current_date
  ) as is_overdue
from public.follow_up_cases follow_up
join public.employees employee
  on employee.id = follow_up.employee_id
join public.organizations organization
  on organization.id = follow_up.organization_id
left join public.departments department
  on department.id = employee.department_id
join public.surveillance_evaluations evaluation
  on evaluation.id = follow_up.trigger_evaluation_id
join public.rule_sets rule_set
  on rule_set.id = evaluation.rule_set_id
 and rule_set.version = evaluation.rule_version;
create or replace function public.advance_follow_up_case(
  p_case_id uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_case public.follow_up_cases%rowtype;
  updated_case public.follow_up_cases%rowtype;
begin
  select *
  into old_case
  from public.follow_up_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Follow-up case % not found', p_case_id;
  end if;

  update public.follow_up_cases
  set
    status = p_new_status,
    repeat_completed_date = case
      when p_new_status = 'REPEAT_COMPLETED' then coalesce(repeat_completed_date, current_date)
      else repeat_completed_date
    end,
    physician_review_date = case
      when p_new_status = 'PHYSICIAN_REVIEW' then coalesce(physician_review_date, current_date)
      else physician_review_date
    end,
    intervention_required = case
      when p_new_status = 'INTERVENTION_REQUIRED' then true
      else intervention_required
    end,
    follow_up_date = case
      when p_new_status = 'FOLLOW_UP' then coalesce(follow_up_date, current_date)
      else follow_up_date
    end,
    closed_date = case
      when p_new_status = 'CLOSED' then coalesce(closed_date, current_date)
      else null
    end
  where id = p_case_id
  returning * into updated_case;

  insert into public.audit_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    old_values_json,
    new_values_json
  )
  values (
    updated_case.organization_id,
    'follow_up_case',
    updated_case.id,
    'FOLLOW_UP_STATUS_CHANGED',
    jsonb_build_object('status', old_case.status),
    jsonb_build_object(
      'status', updated_case.status,
      'repeatCompletedDate', updated_case.repeat_completed_date,
      'physicianReviewDate', updated_case.physician_review_date,
      'followUpDate', updated_case.follow_up_date,
      'closedDate', updated_case.closed_date
    )
  );

  return jsonb_build_object(
    'id', updated_case.id,
    'previousStatus', old_case.status,
    'status', updated_case.status
  );
end;
$$;
comment on view public.follow_up_queue is
  'Phase 4 work queue. Cases originate only from the Thai operational workflow.';
comment on function public.advance_follow_up_case(uuid, text) is
  'Atomically advances a validated follow-up state and records its audit event.';

-- 20260811030000_phase5_population_analytics.sql

-- Phase 5 population surveillance read models.
-- Prevalence is based only on evaluable Thai operational results. These views
-- describe observed surveillance burden and never infer occupational causation.

create or replace view public.employee_population_surveillance
with (security_invoker = true)
as
select
  employee.id as employee_id,
  employee.organization_id,
  employee.department_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.job_title,
  organization.code as organization_code,
  organization.name as organization_name,
  organization.name_th as organization_name_th,
  department.code as department_code,
  department.name as department_name,
  extract(year from current_date)::integer as surveillance_year,
  annual_audiogram.exam_date as annual_audiogram_date,
  annual_audiogram.exam_date is not null as annual_audiometry_completed,
  thai_evaluation.status as thai_evaluation_status,
  exists (
    select 1
    from public.noise_exposures exposure
    where exposure.organization_id = employee.organization_id
      and (
        exposure.employee_id = employee.id
        or (
          exposure.employee_id is null
          and employee.department_id is not null
          and exposure.department_id = employee.department_id
        )
      )
  ) as linked_noise_exposure,
  latest_case.status as follow_up_status,
  latest_case.repeat_due_date,
  (
    latest_case.status in ('SHIFT_DETECTED', 'REPEAT_REQUIRED')
    and latest_case.repeat_due_date < current_date
  ) as repeat_overdue
from public.employees employee
join public.organizations organization
  on organization.id = employee.organization_id
left join public.departments department
  on department.id = employee.department_id
left join lateral (
  select audiogram.exam_date
  from public.audiograms audiogram
  where audiogram.employee_id = employee.id
    and audiogram.exam_type = 'ANNUAL'
    and audiogram.is_valid
    and extract(year from audiogram.exam_date) = extract(year from current_date)
  order by audiogram.exam_date desc, audiogram.created_at desc
  limit 1
) annual_audiogram on true
left join lateral (
  select evaluation.status
  from public.surveillance_evaluations evaluation
  join public.rule_sets rule_set
    on rule_set.id = evaluation.rule_set_id
   and rule_set.version = evaluation.rule_version
  join public.audiograms current_audiogram
    on current_audiogram.id = evaluation.current_audiogram_id
  where evaluation.employee_id = employee.id
    and rule_set.code = 'THAI_HEARING_2561'
    and extract(year from current_audiogram.exam_date) = extract(year from current_date)
  order by evaluation.evaluated_at desc, evaluation.created_at desc
  limit 1
) thai_evaluation on true
left join lateral (
  select follow_up.status, follow_up.repeat_due_date
  from public.follow_up_cases follow_up
  where follow_up.employee_id = employee.id
  order by
    case when follow_up.status = 'CLOSED' then 1 else 0 end,
    follow_up.updated_at desc
  limit 1
) latest_case on true
where employee.active;
create or replace view public.organization_population_surveillance
with (security_invoker = true)
as
select
  fact.organization_id,
  fact.organization_code,
  fact.organization_name,
  fact.organization_name_th,
  fact.surveillance_year,
  count(*)::integer as workers_under_surveillance,
  count(*) filter (where fact.linked_noise_exposure)::integer as workers_with_noise_exposure,
  count(*) filter (where fact.annual_audiometry_completed)::integer as audiograms_completed,
  round(
    100.0 * count(*) filter (where fact.annual_audiometry_completed)
    / nullif(count(*), 0),
    1
  ) as audiometry_completion_pct,
  count(*) filter (
    where fact.thai_evaluation_status in ('POSITIVE', 'NEGATIVE')
  )::integer as evaluable_workers,
  count(*) filter (
    where fact.thai_evaluation_status = 'NOT_EVALUABLE'
  )::integer as not_evaluable_workers,
  count(*) filter (
    where fact.thai_evaluation_status = 'POSITIVE'
  )::integer as threshold_shifts,
  round(
    100.0 * count(*) filter (where fact.thai_evaluation_status = 'POSITIVE')
    / nullif(
      count(*) filter (where fact.thai_evaluation_status in ('POSITIVE', 'NEGATIVE')),
      0
    ),
    1
  ) as shift_prevalence_pct,
  count(*) filter (
    where fact.follow_up_status in ('SHIFT_DETECTED', 'REPEAT_REQUIRED')
  )::integer as awaiting_repeat,
  count(*) filter (
    where fact.follow_up_status in ('REPEAT_COMPLETED', 'PHYSICIAN_REVIEW')
  )::integer as awaiting_physician_review,
  count(*) filter (
    where fact.follow_up_status = 'INTERVENTION_REQUIRED'
  )::integer as intervention_required,
  count(*) filter (
    where fact.follow_up_status = 'FOLLOW_UP'
  )::integer as follow_up_required,
  count(*) filter (
    where fact.follow_up_status is not null and fact.follow_up_status <> 'CLOSED'
  )::integer as outstanding_follow_up,
  count(*) filter (where fact.repeat_overdue)::integer as repeat_overdue,
  count(*) filter (where fact.follow_up_status = 'CLOSED')::integer as cases_closed
from public.employee_population_surveillance fact
group by
  fact.organization_id,
  fact.organization_code,
  fact.organization_name,
  fact.organization_name_th,
  fact.surveillance_year;
create or replace view public.department_population_surveillance
with (security_invoker = true)
as
with department_rollup as (
  select
    fact.organization_id,
    fact.organization_code,
    fact.organization_name,
    fact.department_id,
    fact.department_code,
    fact.department_name,
    fact.surveillance_year,
    count(*)::integer as workers_under_surveillance,
    count(*) filter (where fact.linked_noise_exposure)::integer as workers_with_noise_exposure,
    count(*) filter (where fact.annual_audiometry_completed)::integer as audiograms_completed,
    round(
      100.0 * count(*) filter (where fact.annual_audiometry_completed)
      / nullif(count(*), 0),
      1
    ) as audiometry_completion_pct,
    count(*) filter (
      where fact.thai_evaluation_status in ('POSITIVE', 'NEGATIVE')
    )::integer as evaluable_workers,
    count(*) filter (
      where fact.thai_evaluation_status = 'NOT_EVALUABLE'
    )::integer as not_evaluable_workers,
    count(*) filter (
      where fact.thai_evaluation_status = 'POSITIVE'
    )::integer as threshold_shifts,
    round(
      100.0 * count(*) filter (where fact.thai_evaluation_status = 'POSITIVE')
      / nullif(
        count(*) filter (where fact.thai_evaluation_status in ('POSITIVE', 'NEGATIVE')),
        0
      ),
      1
    ) as shift_prevalence_pct,
    count(*) filter (
      where fact.follow_up_status in ('SHIFT_DETECTED', 'REPEAT_REQUIRED')
    )::integer as awaiting_repeat,
    count(*) filter (
      where fact.follow_up_status in ('REPEAT_COMPLETED', 'PHYSICIAN_REVIEW')
    )::integer as awaiting_physician_review,
    count(*) filter (
      where fact.follow_up_status = 'INTERVENTION_REQUIRED'
    )::integer as intervention_required,
    count(*) filter (
      where fact.follow_up_status = 'FOLLOW_UP'
    )::integer as follow_up_required,
    count(*) filter (
      where fact.follow_up_status is not null and fact.follow_up_status <> 'CLOSED'
    )::integer as outstanding_follow_up,
    count(*) filter (where fact.repeat_overdue)::integer as repeat_overdue,
    count(*) filter (where fact.follow_up_status = 'CLOSED')::integer as cases_closed
  from public.employee_population_surveillance fact
  where fact.department_id is not null
  group by
    fact.organization_id,
    fact.organization_code,
    fact.organization_name,
    fact.department_id,
    fact.department_code,
    fact.department_name,
    fact.surveillance_year
)
select
  department_rollup.*,
  organization_rollup.shift_prevalence_pct as organization_shift_prevalence_pct,
  (
    department_rollup.threshold_shifts > 0
    and department_rollup.shift_prevalence_pct > organization_rollup.shift_prevalence_pct
  ) as potential_deterioration_cluster
from department_rollup
join public.organization_population_surveillance organization_rollup
  on organization_rollup.organization_id = department_rollup.organization_id
 and organization_rollup.surveillance_year = department_rollup.surveillance_year;
comment on view public.employee_population_surveillance is
  'Current-year employee facts for population surveillance; Thai operational results only.';
comment on view public.organization_population_surveillance is
  'Company-level observed completion, Thai shift prevalence, and workflow burden.';
comment on view public.department_population_surveillance is
  'Department comparison with a data-relative potential deterioration cluster flag; not a diagnosis or predictive risk score.';

-- 20260811040000_phase6_import_workflow.sql

-- Phase 6 CSV import workflow.
-- Source rows, mapping, validation messages, and normalized clinical payloads
-- remain attached to an auditable batch. The commit function is atomic and
-- intentionally runs only the Thai operational rule plus the independent OSHA
-- comparator. NIOSH suggestions are never created by this workflow.

alter table public.import_batches
  add column source_headers_json jsonb not null default '[]'::jsonb,
  add column column_mapping_json jsonb not null default '{}'::jsonb,
  add column exam_type text not null default 'ANNUAL',
  add column existing_employees_matched integer not null default 0,
  add column new_employees_created integer not null default 0,
  add column audiograms_imported integer not null default 0,
  add column threshold_shifts_detected integer not null default 0,
  add column follow_up_cases_created integer not null default 0,
  add column completed_at timestamptz,
  add column error_message text,
  add constraint import_batches_headers_array
    check (jsonb_typeof(source_headers_json) = 'array'),
  add constraint import_batches_mapping_object
    check (jsonb_typeof(column_mapping_json) = 'object'),
  add constraint import_batches_exam_type_valid
    check (exam_type in ('ANNUAL', 'REPEAT', 'CONFIRMATION', 'OTHER')),
  add constraint import_batches_result_counts_nonnegative check (
    existing_employees_matched >= 0
    and new_employees_created >= 0
    and audiograms_imported >= 0
    and threshold_shifts_detected >= 0
    and follow_up_cases_created >= 0
  );
create table public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  row_number integer not null,
  source_data_json jsonb not null,
  normalized_data_json jsonb,
  classification text,
  messages_json jsonb not null default '[]'::jsonb,
  matched_employee_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint import_batch_rows_batch_row_unique unique (import_batch_id, row_number),
  constraint import_batch_rows_row_number_valid check (row_number >= 2),
  constraint import_batch_rows_source_object check (jsonb_typeof(source_data_json) = 'object'),
  constraint import_batch_rows_normalized_object check (
    normalized_data_json is null or jsonb_typeof(normalized_data_json) = 'object'
  ),
  constraint import_batch_rows_classification_valid check (
    classification is null or classification in ('READY', 'WARNING', 'ERROR')
  ),
  constraint import_batch_rows_messages_array check (jsonb_typeof(messages_json) = 'array'),
  constraint import_batch_rows_employee_same_organization
    foreign key (matched_employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict
);
create index import_batch_rows_batch_classification_idx
  on public.import_batch_rows (import_batch_id, classification, row_number);
create trigger import_batch_rows_set_updated_at
before update on public.import_batch_rows
for each row execute function public.set_updated_at();
alter table public.import_batch_rows enable row level security;
create policy import_batch_rows_by_membership
on public.import_batch_rows for all to public
using (public.can_access_organization(organization_id))
with check (public.can_access_organization(organization_id));
create or replace view public.import_batch_directory
with (security_invoker = true)
as
select
  batch.id,
  batch.organization_id,
  organization.code as organization_code,
  organization.name as organization_name,
  organization.name_th as organization_name_th,
  batch.filename,
  batch.uploaded_at,
  batch.status,
  batch.exam_type,
  batch.rows_total,
  batch.rows_success,
  batch.rows_warning,
  batch.rows_failed,
  batch.source_headers_json,
  batch.column_mapping_json,
  batch.existing_employees_matched,
  batch.new_employees_created,
  batch.audiograms_imported,
  batch.threshold_shifts_detected,
  batch.follow_up_cases_created,
  batch.completed_at,
  batch.error_message
from public.import_batches batch
join public.organizations organization on organization.id = batch.organization_id;
create or replace function public.save_import_batch_validation(
  target_batch_id uuid,
  mapping_json jsonb,
  validated_rows_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_record public.import_batches%rowtype;
  row_payload jsonb;
  updated_row_count integer := 0;
  ready_count integer;
  warning_count integer;
  error_count integer;
begin
  select * into batch_record
  from public.import_batches
  where id = target_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if batch_record.status not in ('UPLOADED', 'VALIDATING', 'FAILED') then
    raise exception 'Import batch cannot be validated in its current state';
  end if;

  if jsonb_typeof(mapping_json) <> 'object'
    or jsonb_typeof(validated_rows_json) <> 'array'
    or jsonb_array_length(validated_rows_json) <> batch_record.rows_total
  then
    raise exception 'Invalid validation payload';
  end if;

  for row_payload in select * from jsonb_array_elements(validated_rows_json)
  loop
    update public.import_batch_rows
    set
      normalized_data_json = row_payload -> 'normalized',
      classification = row_payload ->> 'classification',
      messages_json = coalesce(row_payload -> 'messages', '[]'::jsonb),
      matched_employee_id = nullif(row_payload ->> 'matchedEmployeeId', '')::uuid
    where id = (row_payload ->> 'id')::uuid
      and import_batch_id = target_batch_id;

    if not found then
      raise exception 'Validation payload contains a row outside this batch';
    end if;
    updated_row_count := updated_row_count + 1;
  end loop;

  select
    count(*) filter (where classification = 'READY')::integer,
    count(*) filter (where classification = 'WARNING')::integer,
    count(*) filter (where classification = 'ERROR')::integer
  into ready_count, warning_count, error_count
  from public.import_batch_rows
  where import_batch_id = target_batch_id;

  if updated_row_count <> batch_record.rows_total
    or ready_count + warning_count + error_count <> batch_record.rows_total
  then
    raise exception 'Import batch validation is incomplete';
  end if;

  update public.import_batches
  set
    status = case when error_count > 0 then 'VALIDATING' else 'READY' end,
    column_mapping_json = mapping_json,
    rows_success = ready_count,
    rows_warning = warning_count,
    rows_failed = error_count,
    error_message = null
  where id = target_batch_id;
end;
$$;
create or replace function public.commit_import_batch(target_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch_record public.import_batches%rowtype;
  staged_row public.import_batch_rows%rowtype;
  normalized jsonb;
  employee_record public.employees%rowtype;
  employee_id_value uuid;
  audiogram_id_value uuid;
  thai_evaluation_id uuid;
  thai_rule public.rule_sets%rowtype;
  osha_rule public.rule_sets%rowtype;
  threshold_count integer;
  matched_count integer := 0;
  created_count integer := 0;
  imported_count integer := 0;
  shift_count integer := 0;
  follow_up_count integer := 0;
  thai_status text;
  osha_status text;
begin
  select * into batch_record
  from public.import_batches
  where id = target_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if batch_record.status <> 'READY' then
    raise exception 'Import batch must be READY before commit';
  end if;

  if batch_record.rows_total < 1 then
    raise exception 'Import batch has no rows';
  end if;

  if exists (
    select 1 from public.import_batch_rows
    where import_batch_id = target_batch_id
      and classification = 'ERROR'
  ) then
    raise exception 'Import batch contains validation errors';
  end if;

  if (
    select count(*) from public.import_batch_rows
    where import_batch_id = target_batch_id
      and classification in ('READY', 'WARNING')
  ) <> batch_record.rows_total then
    raise exception 'Import batch validation is incomplete';
  end if;

  select * into thai_rule
  from public.rule_sets
  where code = 'THAI_HEARING_2561' and version = '1.0.0';

  select * into osha_rule
  from public.rule_sets
  where code = 'OSHA_STS_29_CFR_1910_95' and version = '0.1.0';

  if thai_rule.id is null or osha_rule.id is null then
    raise exception 'Required Thai or OSHA rule metadata is missing';
  end if;

  begin
    update public.import_batches
    set status = 'IMPORTING', error_message = null
    where id = target_batch_id;

    for staged_row in
      select * from public.import_batch_rows
      where import_batch_id = target_batch_id
        and classification in ('READY', 'WARNING')
      order by row_number
    loop
      normalized := staged_row.normalized_data_json;

      if normalized is null
        or jsonb_typeof(normalized -> 'thresholds') <> 'array'
        or jsonb_array_length(normalized -> 'thresholds') <> 14
      then
        raise exception 'Row % does not contain 14 normalized thresholds', staged_row.row_number;
      end if;

      select count(*) into threshold_count
      from (
        select distinct
          threshold ->> 'ear' as ear,
          (threshold ->> 'frequencyHz')::integer as frequency_hz
        from jsonb_array_elements(normalized -> 'thresholds') threshold
        where threshold ->> 'ear' in ('LEFT', 'RIGHT')
          and (threshold ->> 'frequencyHz')::integer in (500, 1000, 2000, 3000, 4000, 6000, 8000)
          and (threshold ->> 'thresholdDbHl')::numeric between -20 and 140
      ) validated_thresholds;

      if threshold_count <> 14 then
        raise exception 'Row % contains invalid or duplicate thresholds', staged_row.row_number;
      end if;

      employee_id_value := staged_row.matched_employee_id;

      if employee_id_value is null then
        select * into employee_record
        from public.employees
        where organization_id = batch_record.organization_id
          and employee_number = normalized ->> 'employeeNumber';

        if found then
          employee_id_value := employee_record.id;
          matched_count := matched_count + 1;
        else
          if nullif(btrim(normalized ->> 'firstName'), '') is null
            or nullif(btrim(normalized ->> 'lastName'), '') is null
            or nullif(normalized ->> 'departmentId', '') is null
          then
            raise exception 'Row % cannot create an employee without name and department', staged_row.row_number;
          end if;

          insert into public.employees (
            organization_id,
            department_id,
            employee_number,
            first_name,
            last_name,
            active
          ) values (
            batch_record.organization_id,
            (normalized ->> 'departmentId')::uuid,
            normalized ->> 'employeeNumber',
            normalized ->> 'firstName',
            normalized ->> 'lastName',
            true
          ) returning * into employee_record;

          employee_id_value := employee_record.id;
          created_count := created_count + 1;
        end if;
      else
        select * into employee_record
        from public.employees
        where id = employee_id_value
          and organization_id = batch_record.organization_id;

        if not found then
          raise exception 'Row % employee match is no longer valid', staged_row.row_number;
        end if;

        matched_count := matched_count + 1;
      end if;

      if exists (
        select 1 from public.audiograms
        where employee_id = employee_id_value
          and exam_date = (normalized ->> 'examDate')::date
          and exam_type = batch_record.exam_type
      ) then
        raise exception 'Row % duplicates an existing audiogram', staged_row.row_number;
      end if;

      insert into public.audiograms (
        organization_id,
        employee_id,
        exam_date,
        exam_type,
        is_valid,
        validation_notes,
        import_batch_id
      ) values (
        batch_record.organization_id,
        employee_id_value,
        (normalized ->> 'examDate')::date,
        batch_record.exam_type,
        true,
        case when staged_row.classification = 'WARNING'
          then 'Imported after warning review; see import batch row messages.'
        end,
        target_batch_id
      ) returning id into audiogram_id_value;

      insert into public.audiogram_thresholds (
        audiogram_id,
        ear,
        frequency_hz,
        threshold_db_hl
      )
      select
        audiogram_id_value,
        threshold ->> 'ear',
        (threshold ->> 'frequencyHz')::integer,
        (threshold ->> 'thresholdDbHl')::numeric
      from jsonb_array_elements(normalized -> 'thresholds') threshold;

      thai_status := upper(normalized #>> '{thaiEvaluation,status}');
      osha_status := upper(normalized #>> '{oshaEvaluation,status}');

      if thai_status not in ('NEGATIVE', 'POSITIVE', 'NOT_EVALUABLE')
        or osha_status not in ('NEGATIVE', 'POSITIVE', 'NOT_EVALUABLE')
      then
        raise exception 'Row % contains an invalid evaluation snapshot', staged_row.row_number;
      end if;

      insert into public.surveillance_evaluations (
        organization_id,
        employee_id,
        current_audiogram_id,
        baseline_audiogram_id,
        baseline_history_id,
        rule_set_id,
        rule_version,
        status,
        evaluation_result_json,
        evaluated_at
      ) values (
        batch_record.organization_id,
        employee_id_value,
        audiogram_id_value,
        nullif(normalized ->> 'baselineAudiogramId', '')::uuid,
        nullif(normalized ->> 'baselineHistoryId', '')::uuid,
        thai_rule.id,
        thai_rule.version,
        thai_status,
        normalized -> 'thaiEvaluation',
        (normalized #>> '{thaiEvaluation,evaluatedAt}')::timestamptz
      ) returning id into thai_evaluation_id;

      insert into public.surveillance_evaluations (
        organization_id,
        employee_id,
        current_audiogram_id,
        baseline_audiogram_id,
        baseline_history_id,
        rule_set_id,
        rule_version,
        status,
        evaluation_result_json,
        evaluated_at
      ) values (
        batch_record.organization_id,
        employee_id_value,
        audiogram_id_value,
        nullif(normalized ->> 'baselineAudiogramId', '')::uuid,
        nullif(normalized ->> 'baselineHistoryId', '')::uuid,
        osha_rule.id,
        osha_rule.version,
        osha_status,
        normalized -> 'oshaEvaluation',
        (normalized #>> '{oshaEvaluation,evaluatedAt}')::timestamptz
      );

      if thai_status = 'POSITIVE' then
        insert into public.follow_up_cases (
          organization_id,
          employee_id,
          trigger_evaluation_id,
          status,
          priority,
          detected_date,
          repeat_due_date
        ) values (
          batch_record.organization_id,
          employee_id_value,
          thai_evaluation_id,
          'REPEAT_REQUIRED',
          'NORMAL',
          (normalized ->> 'examDate')::date,
          (normalized ->> 'examDate')::date + 30
        );

        shift_count := shift_count + 1;
        follow_up_count := follow_up_count + 1;
      end if;

      imported_count := imported_count + 1;

      insert into public.audit_logs (
        organization_id,
        entity_type,
        entity_id,
        action,
        new_values_json
      ) values (
        batch_record.organization_id,
        'audiogram',
        audiogram_id_value,
        'CSV_IMPORT_COMMITTED',
        jsonb_build_object(
          'importBatchId', target_batch_id,
          'sourceRowNumber', staged_row.row_number,
          'employeeId', employee_id_value,
          'thaiStatus', thai_status,
          'oshaStatus', osha_status,
          'nioshAutomaticallyEvaluated', false
        )
      );
    end loop;

    update public.import_batches
    set
      status = 'COMPLETED',
      rows_success = imported_count,
      rows_failed = 0,
      existing_employees_matched = matched_count,
      new_employees_created = created_count,
      audiograms_imported = imported_count,
      threshold_shifts_detected = shift_count,
      follow_up_cases_created = follow_up_count,
      completed_at = timezone('utc', now()),
      error_message = null
    where id = target_batch_id;

    insert into public.audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action,
      new_values_json
    ) values (
      batch_record.organization_id,
      'import_batch',
      target_batch_id,
      'CSV_IMPORT_COMPLETED',
      jsonb_build_object(
        'filename', batch_record.filename,
        'rowsImported', imported_count,
        'existingEmployeesMatched', matched_count,
        'newEmployeesCreated', created_count,
        'thresholdShiftsDetected', shift_count,
        'followUpCasesCreated', follow_up_count,
        'rulesEvaluated', jsonb_build_array('THAI_HEARING_2561', 'OSHA_STS_29_CFR_1910_95'),
        'nioshAutomaticallyEvaluated', false
      )
    );

    return jsonb_build_object(
      'success', true,
      'batchId', target_batch_id,
      'rowsImported', imported_count,
      'existingEmployeesMatched', matched_count,
      'newEmployeesCreated', created_count,
      'thresholdShiftsDetected', shift_count,
      'followUpCasesCreated', follow_up_count
    );
  exception when others then
    update public.import_batches
    set
      status = 'FAILED',
      error_message = left(sqlerrm, 1000),
      completed_at = null,
      audiograms_imported = 0,
      threshold_shifts_detected = 0,
      follow_up_cases_created = 0
    where id = target_batch_id;

    insert into public.audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action,
      new_values_json
    ) values (
      batch_record.organization_id,
      'import_batch',
      target_batch_id,
      'CSV_IMPORT_FAILED',
      jsonb_build_object('error', left(sqlerrm, 1000))
    );

    return jsonb_build_object(
      'success', false,
      'batchId', target_batch_id,
      'error', left(sqlerrm, 1000)
    );
  end;
end;
$$;
comment on table public.import_batch_rows is
  'Auditable Phase 6 CSV staging rows with mapping output and pre-commit validation messages.';
comment on view public.import_batch_directory is
  'Phase 6 batch history and import outcome counters.';
comment on function public.commit_import_batch(uuid) is
  'Atomically creates employees, audiograms, Thai/OSHA evaluations, and Thai follow-up cases for one validated CSV batch. NIOSH is intentionally excluded.';
comment on function public.save_import_batch_validation(uuid, jsonb, jsonb) is
  'Atomically stores Phase 6 row validation output and advances an import batch to READY only when no row has an error.';

-- 20260811050000_phase7_auth_audit_rls.sql

-- Phase 7 authentication, role-aware RLS, and audit-read models.
-- Authenticated users can read only authorized organizations. Clinical writes
-- are limited to hospital administrators and authorized occupational-health
-- staff; company users are read-only.

create or replace function public.is_hospital_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and access.role = 'HOSPITAL_ADMIN'
  );
$$;
create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and (
        access.role = 'HOSPITAL_ADMIN'
        or (
          access.role = 'OCCUPATIONAL_HEALTH_STAFF'
          and access.organization_id = target_organization_id
        )
      )
  );
$$;
drop policy if exists organizations_by_membership on public.organizations;
create policy organizations_authorized_read
on public.organizations for select to public
using (public.can_access_organization(id));
create policy organizations_admin_insert
on public.organizations for insert to public
with check (public.is_hospital_admin());
create policy organizations_admin_update
on public.organizations for update to public
using (public.is_hospital_admin())
with check (public.is_hospital_admin());
create policy organizations_admin_delete
on public.organizations for delete to public
using (public.is_hospital_admin());
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments',
    'employees',
    'noise_exposures',
    'audiograms',
    'hearing_baseline_history',
    'follow_up_cases',
    'import_batches',
    'import_batch_rows'
  ]
  loop
    execute format('drop policy if exists %I_by_membership on public.%I', table_name, table_name);
    execute format(
      'create policy %I_authorized_read on public.%I for select to public using (public.can_access_organization(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_staff_insert on public.%I for insert to public with check (public.can_manage_organization(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_staff_update on public.%I for update to public using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_staff_delete on public.%I for delete to public using (public.can_manage_organization(organization_id))',
      table_name,
      table_name
    );
  end loop;
end;
$$;
drop policy if exists surveillance_evaluations_by_membership_read on public.surveillance_evaluations;
drop policy if exists surveillance_evaluations_by_membership_insert on public.surveillance_evaluations;
create policy surveillance_evaluations_authorized_read
on public.surveillance_evaluations for select to public
using (public.can_access_organization(organization_id));
create policy surveillance_evaluations_staff_insert
on public.surveillance_evaluations for insert to public
with check (public.can_manage_organization(organization_id));
drop policy if exists audit_logs_by_membership_read on public.audit_logs;
drop policy if exists audit_logs_by_membership_insert on public.audit_logs;
create policy audit_logs_authorized_read
on public.audit_logs for select to public
using (public.can_access_organization(organization_id));
drop policy if exists audiogram_thresholds_by_audiogram_membership on public.audiogram_thresholds;
create policy audiogram_thresholds_authorized_read
on public.audiogram_thresholds for select to public
using (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
);
create policy audiogram_thresholds_staff_insert
on public.audiogram_thresholds for insert to public
with check (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
);
create policy audiogram_thresholds_staff_update
on public.audiogram_thresholds for update to public
using (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
);
create policy audiogram_thresholds_staff_delete
on public.audiogram_thresholds for delete to public
using (
  exists (
    select 1
    from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
);
alter table public.audit_logs
  add column actor_email text,
  add column actor_role text,
  add constraint audit_logs_actor_role_valid check (
    actor_role is null
    or actor_role in ('HOSPITAL_ADMIN', 'OCCUPATIONAL_HEALTH_STAFF', 'COMPANY_USER')
  );
create or replace function public.attribute_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.actor_email := coalesce(new.actor_email, nullif(auth.jwt() ->> 'email', ''));

  if new.actor_role is null and auth.uid() is not null then
    select access.role into new.actor_role
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.active
      and (
        access.role = 'HOSPITAL_ADMIN'
        or access.organization_id = new.organization_id
      )
    order by case access.role
      when 'HOSPITAL_ADMIN' then 1
      when 'OCCUPATIONAL_HEALTH_STAFF' then 2
      else 3
    end
    limit 1;
  end if;

  return new;
end;
$$;
create trigger audit_logs_attribute_actor
before insert on public.audit_logs
for each row execute function public.attribute_audit_actor();
create or replace function public.attribute_import_uploader()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
begin
  new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
  return new;
end;
$$;
create trigger import_batches_attribute_uploader
before insert on public.import_batches
for each row execute function public.attribute_import_uploader();
create or replace view public.audit_log_directory
with (security_invoker = true)
as
select
  audit.id,
  audit.organization_id,
  organization.code as organization_code,
  organization.name as organization_name,
  organization.name_th as organization_name_th,
  audit.user_id,
  audit.actor_email,
  audit.actor_role,
  audit.entity_type,
  audit.entity_id,
  audit.action,
  audit.old_values_json,
  audit.new_values_json,
  audit.created_at
from public.audit_logs audit
left join public.organizations organization on organization.id = audit.organization_id;
create index audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);
create index audit_logs_actor_created_idx
  on public.audit_logs (user_id, created_at desc)
  where user_id is not null;
-- Preserve the Phase 4/6 transaction bodies as owner-only internals, then add
-- authenticated wrappers with organization-role checks close to the data.
alter function public.advance_follow_up_case(uuid, text)
  rename to advance_follow_up_case_internal;
alter function public.save_import_batch_validation(uuid, jsonb, jsonb)
  rename to save_import_batch_validation_internal;
alter function public.commit_import_batch(uuid)
  rename to commit_import_batch_internal;
create or replace function public.advance_follow_up_case(
  p_case_id uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id
  from public.follow_up_cases
  where id = p_case_id;

  if target_organization_id is null
    or not (
      coalesce(auth.role(), '') = 'service_role'
      or public.can_manage_organization(target_organization_id)
    )
  then
    raise exception 'Not authorized to manage this follow-up case'
      using errcode = '42501';
  end if;

  return public.advance_follow_up_case_internal(p_case_id, p_new_status);
end;
$$;
create or replace function public.save_import_batch_validation(
  target_batch_id uuid,
  mapping_json jsonb,
  validated_rows_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id
  from public.import_batches
  where id = target_batch_id;

  if target_organization_id is null
    or not (
      coalesce(auth.role(), '') = 'service_role'
      or public.can_manage_organization(target_organization_id)
    )
  then
    raise exception 'Not authorized to validate this import batch'
      using errcode = '42501';
  end if;

  perform public.save_import_batch_validation_internal(
    target_batch_id,
    mapping_json,
    validated_rows_json
  );
end;
$$;
create or replace function public.commit_import_batch(target_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id
  from public.import_batches
  where id = target_batch_id;

  if target_organization_id is null
    or not (
      coalesce(auth.role(), '') = 'service_role'
      or public.can_manage_organization(target_organization_id)
    )
  then
    raise exception 'Not authorized to commit this import batch'
      using errcode = '42501';
  end if;

  return public.commit_import_batch_internal(target_batch_id);
end;
$$;
comment on function public.can_manage_organization(uuid) is
  'True only for hospital administrators or occupational-health staff assigned to the target organization.';
comment on view public.audit_log_directory is
  'Organization-scoped immutable audit events with safe actor attribution for the Phase 7 UI.';

-- 20260811060000_phase8_baseline_governance.sql

-- Phase 8 post-core baseline governance and international suggestion layer.
-- Suggestions are durable and reviewable but can never mutate the Thai
-- operational baseline or Thai follow-up workflow automatically.

alter table public.user_organization_access
  drop constraint user_organization_access_role_valid,
  add constraint user_organization_access_role_valid check (
    role in (
      'HOSPITAL_ADMIN',
      'OCCUPATIONAL_HEALTH_STAFF',
      'OCCUPATIONAL_PHYSICIAN',
      'COMPANY_USER'
    )
  );
alter table public.audit_logs
  drop constraint audit_logs_actor_role_valid,
  add constraint audit_logs_actor_role_valid check (
    actor_role is null
    or actor_role in (
      'HOSPITAL_ADMIN',
      'OCCUPATIONAL_HEALTH_STAFF',
      'OCCUPATIONAL_PHYSICIAN',
      'COMPANY_USER'
    )
  );
create or replace function public.can_review_baseline(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and access.role = 'OCCUPATIONAL_PHYSICIAN'
      and access.organization_id = target_organization_id
  );
$$;
create table public.baseline_interpretation_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  framework text not null,
  suggestion_type text not null,
  qualitative_state text not null,
  ear_scope text not null default 'BOTH',
  active_baseline_history_id uuid references public.hearing_baseline_history(id) on delete restrict,
  monitoring_audiogram_id uuid not null,
  immediate_retest_audiogram_id uuid,
  confirmation_audiogram_id uuid,
  candidate_audiogram_id uuid,
  evidence_json jsonb not null default '{}'::jsonb,
  explanation text not null,
  required_action text not null,
  automatic_baseline_change boolean not null default false,
  thai_follow_up_mutation boolean not null default false,
  review_status text not null default 'PENDING',
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint baseline_suggestion_employee_same_organization
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint baseline_suggestion_monitoring_same_employee
    foreign key (monitoring_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint baseline_suggestion_retest_same_employee
    foreign key (immediate_retest_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint baseline_suggestion_confirmation_same_employee
    foreign key (confirmation_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint baseline_suggestion_candidate_same_employee
    foreign key (candidate_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint baseline_suggestion_framework_valid check (framework in ('OSHA', 'NIOSH')),
  constraint baseline_suggestion_type_valid check (suggestion_type in (
    'CURRENT_BASELINE_CONFIRMED',
    'OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS',
    'OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT',
    'NIOSH_PERSISTENT_SHIFT_CONFIRMED',
    'NIOSH_SHIFT_NOT_CONFIRMED',
    'POSSIBLE_MEASUREMENT_VARIABILITY',
    'INSUFFICIENT_DATA'
  )),
  constraint baseline_suggestion_state_valid check (
    qualitative_state in ('REVIEW_REQUIRED', 'INSUFFICIENT_DATA', 'SUPPORTED_BY_RULE')
  ),
  constraint baseline_suggestion_ear_valid check (ear_scope in ('LEFT', 'RIGHT', 'BOTH')),
  constraint baseline_suggestion_evidence_object check (jsonb_typeof(evidence_json) = 'object'),
  constraint baseline_suggestion_no_automatic_change check (not automatic_baseline_change),
  constraint baseline_suggestion_no_thai_mutation check (not thai_follow_up_mutation),
  constraint baseline_suggestion_review_status_valid check (
    review_status in ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED')
  ),
  constraint baseline_suggestion_review_consistent check (
    (review_status = 'PENDING' and reviewed_by is null and reviewed_at is null)
    or (review_status <> 'PENDING' and reviewed_at is not null and nullif(btrim(review_note), '') is not null)
  )
);
alter table public.hearing_baseline_history
  add constraint hearing_baseline_source_suggestion_fk
  foreign key (source_suggestion_id)
  references public.baseline_interpretation_suggestions(id) on delete restrict;
create unique index baseline_suggestion_identity_idx
  on public.baseline_interpretation_suggestions (
    employee_id,
    suggestion_type,
    ear_scope,
    monitoring_audiogram_id,
    coalesce(immediate_retest_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(confirmation_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index baseline_suggestion_queue_idx
  on public.baseline_interpretation_suggestions (organization_id, review_status, created_at desc);
create index baseline_suggestion_employee_idx
  on public.baseline_interpretation_suggestions (employee_id, created_at desc);
create trigger baseline_interpretation_suggestions_set_updated_at
before update on public.baseline_interpretation_suggestions
for each row execute function public.set_updated_at();
create or replace function public.attribute_baseline_suggestion_creator()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.created_by_email := coalesce(new.created_by_email, nullif(auth.jwt() ->> 'email', ''));
  return new;
end;
$$;
create trigger baseline_suggestion_attribute_creator
before insert on public.baseline_interpretation_suggestions
for each row execute function public.attribute_baseline_suggestion_creator();
create or replace function public.audit_baseline_suggestion_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    organization_id,
    entity_type,
    entity_id,
    action,
    new_values_json
  ) values (
    new.organization_id,
    'baseline_interpretation_suggestion',
    new.id,
    'BASELINE_SUGGESTION_CREATED',
    jsonb_build_object(
      'framework', new.framework,
      'suggestionType', new.suggestion_type,
      'reviewStatus', new.review_status,
      'automaticBaselineChange', false,
      'thaiFollowUpMutation', false
    )
  );
  return new;
end;
$$;
create trigger baseline_suggestion_audit_created
after insert on public.baseline_interpretation_suggestions
for each row execute function public.audit_baseline_suggestion_created();
alter table public.baseline_interpretation_suggestions enable row level security;
create policy baseline_suggestions_authorized_read
on public.baseline_interpretation_suggestions for select to public
using (public.can_access_organization(organization_id));
create policy baseline_suggestions_staff_insert
on public.baseline_interpretation_suggestions for insert to public
with check (
  public.can_manage_organization(organization_id)
  and not automatic_baseline_change
  and not thai_follow_up_mutation
  and review_status = 'PENDING'
);
create or replace view public.baseline_governance_directory
with (security_invoker = true)
as
select
  suggestion.id,
  suggestion.organization_id,
  organization.code as organization_code,
  organization.name as organization_name,
  organization.name_th as organization_name_th,
  suggestion.employee_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  suggestion.framework,
  suggestion.suggestion_type,
  suggestion.qualitative_state,
  suggestion.ear_scope,
  suggestion.active_baseline_history_id,
  active_baseline.baseline_audiogram_id as active_baseline_audiogram_id,
  active_baseline_audiogram.exam_date as active_baseline_date,
  suggestion.monitoring_audiogram_id,
  monitoring_audiogram.exam_date as monitoring_date,
  suggestion.immediate_retest_audiogram_id,
  immediate_retest.exam_date as immediate_retest_date,
  suggestion.confirmation_audiogram_id,
  confirmation.exam_date as confirmation_date,
  confirmation.hours_since_noise_exposure as confirmation_quiet_hours,
  suggestion.candidate_audiogram_id,
  candidate.exam_date as candidate_date,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', history.id,
        'baselineAudiogramId', history.baseline_audiogram_id,
        'baselineDate', history_audiogram.exam_date,
        'earScope', history.ear_scope,
        'frameworkOrContext', history.framework_or_context,
        'status', history.status,
        'reasonCode', history.reason_code,
        'reasonText', history.reason_text,
        'sourceSuggestionId', history.source_suggestion_id,
        'approvedBy', history.approved_by,
        'approvedAt', history.approved_at,
        'effectiveFrom', history.effective_from,
        'effectiveTo', history.effective_to,
        'createdAt', history.created_at
      )
      order by history.effective_from desc, history.created_at desc
    )
    from public.hearing_baseline_history history
    join public.audiograms history_audiogram
      on history_audiogram.id = history.baseline_audiogram_id
    where history.organization_id = suggestion.organization_id
      and history.employee_id = suggestion.employee_id
  ), '[]'::jsonb) as baseline_history_json,
  suggestion.evidence_json,
  suggestion.explanation,
  suggestion.required_action,
  suggestion.automatic_baseline_change,
  suggestion.thai_follow_up_mutation,
  suggestion.review_status,
  suggestion.created_by,
  suggestion.created_by_email,
  suggestion.reviewed_by,
  suggestion.reviewed_by_email,
  suggestion.reviewed_at,
  suggestion.review_note,
  suggestion.created_at,
  suggestion.updated_at
from public.baseline_interpretation_suggestions suggestion
join public.organizations organization on organization.id = suggestion.organization_id
join public.employees employee on employee.id = suggestion.employee_id
left join public.hearing_baseline_history active_baseline on active_baseline.id = suggestion.active_baseline_history_id
left join public.audiograms active_baseline_audiogram on active_baseline_audiogram.id = active_baseline.baseline_audiogram_id
join public.audiograms monitoring_audiogram on monitoring_audiogram.id = suggestion.monitoring_audiogram_id
left join public.audiograms immediate_retest on immediate_retest.id = suggestion.immediate_retest_audiogram_id
left join public.audiograms confirmation on confirmation.id = suggestion.confirmation_audiogram_id
left join public.audiograms candidate on candidate.id = suggestion.candidate_audiogram_id;
create or replace function public.review_baseline_suggestion(
  p_suggestion_id uuid,
  p_decision text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  suggestion_record public.baseline_interpretation_suggestions%rowtype;
  previous_baseline public.hearing_baseline_history%rowtype;
  candidate_exam_date date;
  new_baseline_id uuid;
  normalized_decision text := upper(btrim(p_decision));
  new_review_status text;
begin
  if normalized_decision not in ('APPROVE', 'REJECT', 'DEFER') then
    raise exception 'Decision must be APPROVE, REJECT, or DEFER' using errcode = '22023';
  end if;
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'A physician review note is required' using errcode = '22023';
  end if;

  select * into suggestion_record
  from public.baseline_interpretation_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Baseline suggestion not found' using errcode = 'P0002';
  end if;
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.can_review_baseline(suggestion_record.organization_id)
  ) then
    raise exception 'Only an assigned occupational physician may review this suggestion'
      using errcode = '42501';
  end if;
  if suggestion_record.review_status not in ('PENDING', 'DEFERRED') then
    raise exception 'This suggestion already has a final review decision' using errcode = '23514';
  end if;

  new_review_status := case normalized_decision
    when 'APPROVE' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    else 'DEFERRED'
  end;

  update public.baseline_interpretation_suggestions
  set review_status = new_review_status,
      reviewed_by = auth.uid(),
      reviewed_by_email = nullif(auth.jwt() ->> 'email', ''),
      reviewed_at = timezone('utc', now()),
      review_note = btrim(p_review_note)
  where id = p_suggestion_id;

  if normalized_decision = 'APPROVE'
    and suggestion_record.suggestion_type in (
      'OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS',
      'OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT'
    )
  then
    if suggestion_record.candidate_audiogram_id is null then
      raise exception 'An OSHA baseline candidate requires a candidate audiogram' using errcode = '23514';
    end if;

    select exam_date into candidate_exam_date
    from public.audiograms
    where id = suggestion_record.candidate_audiogram_id
      and employee_id = suggestion_record.employee_id
      and organization_id = suggestion_record.organization_id;
    if candidate_exam_date is null then
      raise exception 'Candidate audiogram is outside the suggestion scope' using errcode = '23514';
    end if;

    for previous_baseline in
      update public.hearing_baseline_history
      set status = 'SUPERSEDED',
          effective_to = candidate_exam_date,
          updated_at = timezone('utc', now())
      where employee_id = suggestion_record.employee_id
        and organization_id = suggestion_record.organization_id
        and ear_scope = suggestion_record.ear_scope
        and framework_or_context = 'OSHA_ANALYTICAL'
        and status = 'ACTIVE'
      returning *
    loop
      insert into public.audit_logs (
        organization_id, entity_type, entity_id, action, old_values_json, new_values_json
      ) values (
        suggestion_record.organization_id,
        'hearing_baseline_history',
        previous_baseline.id,
        'BASELINE_VERSION_SUPERSEDED',
        jsonb_build_object('status', 'ACTIVE', 'baselineAudiogramId', previous_baseline.baseline_audiogram_id),
        jsonb_build_object('status', 'SUPERSEDED', 'effectiveTo', candidate_exam_date)
      );
    end loop;

    insert into public.hearing_baseline_history (
      organization_id,
      employee_id,
      baseline_audiogram_id,
      ear_scope,
      framework_or_context,
      status,
      reason_code,
      reason_text,
      source_suggestion_id,
      approved_by,
      approved_at,
      effective_from
    ) values (
      suggestion_record.organization_id,
      suggestion_record.employee_id,
      suggestion_record.candidate_audiogram_id,
      suggestion_record.ear_scope,
      'OSHA_ANALYTICAL',
      'ACTIVE',
      suggestion_record.suggestion_type,
      btrim(p_review_note),
      suggestion_record.id,
      auth.uid(),
      timezone('utc', now()),
      candidate_exam_date
    ) returning id into new_baseline_id;

    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action, new_values_json
    ) values (
      suggestion_record.organization_id,
      'hearing_baseline_history',
      new_baseline_id,
      'BASELINE_VERSION_ACTIVATED',
      jsonb_build_object(
        'frameworkOrContext', 'OSHA_ANALYTICAL',
        'earScope', suggestion_record.ear_scope,
        'baselineAudiogramId', suggestion_record.candidate_audiogram_id,
        'sourceSuggestionId', suggestion_record.id,
        'thaiOperationalBaselineChanged', false
      )
    );
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, old_values_json, new_values_json
  ) values (
    suggestion_record.organization_id,
    'baseline_interpretation_suggestion',
    suggestion_record.id,
    case normalized_decision
      when 'APPROVE' then 'BASELINE_REVISION_APPROVED'
      when 'REJECT' then 'BASELINE_REVISION_REJECTED'
      else 'BASELINE_REVIEW_DEFERRED'
    end,
    jsonb_build_object('reviewStatus', suggestion_record.review_status),
    jsonb_build_object(
      'reviewStatus', new_review_status,
      'reviewNote', btrim(p_review_note),
      'newBaselineHistoryId', new_baseline_id,
      'thaiOperationalBaselineChanged', false,
      'thaiFollowUpMutated', false
    )
  );

  return jsonb_build_object(
    'suggestionId', suggestion_record.id,
    'reviewStatus', new_review_status,
    'newBaselineHistoryId', new_baseline_id,
    'thaiOperationalBaselineChanged', false,
    'thaiFollowUpMutated', false
  );
end;
$$;
create or replace function public.attribute_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.actor_email := coalesce(new.actor_email, nullif(auth.jwt() ->> 'email', ''));

  if new.actor_role is null and auth.uid() is not null then
    select access.role into new.actor_role
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.active
      and (
        access.role = 'HOSPITAL_ADMIN'
        or access.organization_id = new.organization_id
      )
    order by case access.role
      when 'HOSPITAL_ADMIN' then 1
      when 'OCCUPATIONAL_PHYSICIAN' then 2
      when 'OCCUPATIONAL_HEALTH_STAFF' then 3
      else 4
    end
    limit 1;
  end if;

  return new;
end;
$$;
comment on table public.baseline_interpretation_suggestions is
  'Durable OSHA/NIOSH decision-support suggestions. Constraints prohibit automatic baseline and Thai follow-up mutations.';
comment on function public.review_baseline_suggestion(uuid, text, text) is
  'Physician-only review. Approved OSHA candidates create an OSHA_ANALYTICAL baseline version and never change THAI_OPERATIONAL history.';

-- 20260813000000_phase9_paperless_audiometry.sql

-- Phase 9: paperless audiometry, hospital HN identity, explicit longitudinal
-- linkage, immutable final records, and Thai initial-baseline governance.

create table public.hospital_patients (
  id uuid primary key default gen_random_uuid(),
  hospital_number text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hospital_patients_hn_format check (hospital_number ~ '^[0-9]{7}$')
);
create trigger hospital_patients_set_updated_at
before update on public.hospital_patients
for each row execute function public.set_updated_at();
alter table public.employees
  add column patient_id uuid references public.hospital_patients(id) on delete restrict;
create unique index employees_patient_organization_unique
  on public.employees (organization_id, patient_id)
  where patient_id is not null;
create index employees_patient_idx on public.employees (patient_id)
  where patient_id is not null;
alter table public.follow_up_cases
  add constraint follow_up_cases_id_scope_unique
  unique (id, organization_id, employee_id);
alter table public.audiograms
  add column record_status text not null default 'FINAL',
  add column examined_at timestamptz,
  add column finalized_at timestamptz,
  add column finalized_by uuid references auth.users(id) on delete set null,
  add column source_monitoring_audiogram_id uuid,
  add column follow_up_case_id uuid,
  add column supersedes_audiogram_id uuid,
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users(id) on delete set null,
  add column void_reason text;
alter table public.audiograms
  alter column examined_at set not null,
  add constraint audiograms_record_status_valid check (
    record_status in ('DRAFT', 'FINAL', 'SUPERSEDED', 'VOID')
  ),
  add constraint audiograms_finalization_consistent check (
    (record_status = 'DRAFT' and finalized_at is null)
    or (record_status in ('FINAL', 'SUPERSEDED') and finalized_at is not null)
    or (record_status = 'VOID' and voided_at is not null and nullif(btrim(void_reason), '') is not null)
  ),
  add constraint audiograms_source_same_employee
    foreign key (source_monitoring_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  add constraint audiograms_supersedes_same_employee
    foreign key (supersedes_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  add constraint audiograms_case_same_employee
    foreign key (follow_up_case_id, organization_id, employee_id)
    references public.follow_up_cases(id, organization_id, employee_id) on delete restrict,
  add constraint audiograms_not_self_linked check (
    id is distinct from source_monitoring_audiogram_id
    and id is distinct from supersedes_audiogram_id
  );
create or replace function public.initialize_audiogram_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.examined_at is null then
    new.examined_at := new.exam_date::timestamp at time zone 'Asia/Bangkok';
  end if;
  if new.record_status = 'FINAL' and new.finalized_at is null then
    new.finalized_at := coalesce(new.created_at, timezone('utc', now()));
  end if;
  return new;
end;
$$;
create trigger audiograms_initialize_lifecycle
before insert on public.audiograms
for each row execute function public.initialize_audiogram_lifecycle();
alter table public.audiograms drop constraint audiograms_natural_key;
create unique index audiograms_one_final_per_day_type_idx
  on public.audiograms (employee_id, exam_date, exam_type)
  where record_status = 'FINAL';
create unique index audiograms_one_open_draft_per_day_type_idx
  on public.audiograms (employee_id, exam_date, exam_type)
  where record_status = 'DRAFT' and supersedes_audiogram_id is null;
create unique index audiograms_one_open_correction_idx
  on public.audiograms (supersedes_audiogram_id)
  where record_status = 'DRAFT' and supersedes_audiogram_id is not null;
create index audiograms_source_sequence_idx
  on public.audiograms (source_monitoring_audiogram_id, exam_type, examined_at)
  where source_monitoring_audiogram_id is not null;
create index audiograms_draft_owner_idx
  on public.audiograms (organization_id, created_at desc)
  where record_status = 'DRAFT';
alter table public.audiogram_thresholds
  add column response_status text not null default 'MEASURED',
  add column no_response_at_db_hl numeric(5, 1),
  alter column threshold_db_hl drop not null,
  add constraint audiogram_threshold_response_valid check (
    response_status in ('MEASURED', 'NO_RESPONSE', 'NOT_TESTED')
  ),
  add constraint audiogram_threshold_observation_consistent check (
    (response_status = 'MEASURED' and threshold_db_hl is not null and no_response_at_db_hl is null)
    or (response_status = 'NO_RESPONSE' and threshold_db_hl is null and no_response_at_db_hl between -20 and 140)
    or (response_status = 'NOT_TESTED' and threshold_db_hl is null and no_response_at_db_hl is null)
  );
create table public.audiogram_pretest_assessments (
  audiogram_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  questionnaire_version text not null default 'OCC_AUDIO_V1',
  quiet_period_answer text not null default 'UNKNOWN',
  quiet_period_hours numeric(5, 1),
  hearing_protection_during_quiet text not null default 'UNKNOWN',
  high_nonoccupational_noise text not null default 'UNKNOWN',
  general_notes text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint audiogram_pretest_same_scope
    foreign key (audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete cascade,
  constraint audiogram_pretest_answers_valid check (
    quiet_period_answer in ('YES', 'NO', 'UNKNOWN')
    and hearing_protection_during_quiet in ('YES', 'NO', 'UNKNOWN')
    and high_nonoccupational_noise in ('YES', 'NO', 'UNKNOWN')
  ),
  constraint audiogram_pretest_quiet_hours_valid check (
    quiet_period_hours is null or quiet_period_hours between 0 and 168
  )
);
create trigger audiogram_pretest_assessments_set_updated_at
before update on public.audiogram_pretest_assessments
for each row execute function public.set_updated_at();
create table public.audiogram_history_responses (
  id uuid primary key default gen_random_uuid(),
  audiogram_id uuid not null references public.audiograms(id) on delete cascade,
  question_code text not null,
  answer text not null,
  ear_scope text,
  details text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint audiogram_history_response_unique unique (audiogram_id, question_code),
  constraint audiogram_history_question_valid check (question_code in (
    'TINNITUS', 'DIZZINESS', 'EAR_PAIN', 'EAR_FULLNESS',
    'FLUCTUATING_HEARING', 'SUDDEN_HEARING_CHANGE', 'HEARING_DIFFICULTY',
    'EAR_INFECTION_OR_DISEASE', 'EAR_SPECIALIST_EVALUATION', 'EAR_SURGERY',
    'HEAD_INJURY_OR_UNCONSCIOUSNESS', 'FAMILY_HEARING_LOSS',
    'PRIOR_HEARING_TEST', 'HEARING_AID_EVALUATION_OR_USE',
    'OTOTOXIC_MEDICATION', 'OTOTOXIC_CHEMICAL_OR_SOLVENT',
    'PRIOR_OR_SECOND_NOISY_JOB', 'NOISY_HOBBY', 'FIREARMS',
    'MILITARY_SERVICE', 'HEARING_PROTECTION_USE'
  )),
  constraint audiogram_history_answer_valid check (answer in ('YES', 'NO', 'UNKNOWN')),
  constraint audiogram_history_ear_valid check (
    ear_scope is null or ear_scope in ('LEFT', 'RIGHT', 'BOTH')
  )
);
create trigger audiogram_history_responses_set_updated_at
before update on public.audiogram_history_responses
for each row execute function public.set_updated_at();
create table public.audiogram_otoscopy_findings (
  id uuid primary key default gen_random_uuid(),
  audiogram_id uuid not null references public.audiograms(id) on delete cascade,
  ear text not null,
  examination_status text not null,
  canal_obstruction boolean not null default false,
  abnormal_tympanic_membrane boolean not null default false,
  perforation boolean not null default false,
  other_finding boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint audiogram_otoscopy_ear_unique unique (audiogram_id, ear),
  constraint audiogram_otoscopy_ear_valid check (ear in ('LEFT', 'RIGHT')),
  constraint audiogram_otoscopy_status_valid check (
    examination_status in ('NORMAL', 'ABNORMAL', 'NOT_EXAMINED')
  ),
  constraint audiogram_otoscopy_normal_consistent check (
    examination_status <> 'NORMAL'
    or not (canal_obstruction or abnormal_tympanic_membrane or perforation or other_finding)
  )
);
create trigger audiogram_otoscopy_findings_set_updated_at
before update on public.audiogram_otoscopy_findings
for each row execute function public.set_updated_at();
alter table public.follow_up_cases
  add column reconciliation_required boolean not null default false,
  add column reconciliation_reason text,
  add constraint follow_up_reconciliation_consistent check (
    not reconciliation_required or nullif(btrim(reconciliation_reason), '') is not null
  );
-- Initial Thai operational baselines use the existing physician review queue,
-- but remain distinct from OSHA/NIOSH analytical suggestions.
alter table public.baseline_interpretation_suggestions
  alter column monitoring_audiogram_id drop not null,
  drop constraint baseline_suggestion_framework_valid,
  add constraint baseline_suggestion_framework_valid check (framework in ('THAI', 'OSHA', 'NIOSH')),
  drop constraint baseline_suggestion_type_valid,
  add constraint baseline_suggestion_type_valid check (suggestion_type in (
    'THAI_INITIAL_BASELINE_CANDIDATE',
    'CURRENT_BASELINE_CONFIRMED',
    'OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS',
    'OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT',
    'NIOSH_PERSISTENT_SHIFT_CONFIRMED',
    'NIOSH_SHIFT_NOT_CONFIRMED',
    'POSSIBLE_MEASUREMENT_VARIABILITY',
    'INSUFFICIENT_DATA'
  )),
  add column superseded_by_suggestion_id uuid references public.baseline_interpretation_suggestions(id) on delete restrict,
  add constraint baseline_suggestion_framework_shape check (
    (framework = 'THAI'
      and suggestion_type = 'THAI_INITIAL_BASELINE_CANDIDATE'
      and monitoring_audiogram_id is null
      and candidate_audiogram_id is not null)
    or (framework in ('OSHA', 'NIOSH') and monitoring_audiogram_id is not null)
  );
drop index baseline_suggestion_identity_idx;
create unique index baseline_suggestion_identity_idx
  on public.baseline_interpretation_suggestions (
    employee_id,
    suggestion_type,
    ear_scope,
    coalesce(monitoring_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(immediate_retest_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(confirmation_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(candidate_audiogram_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create or replace function public.is_hospital_clinical_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and access.role in (
        'HOSPITAL_ADMIN', 'OCCUPATIONAL_HEALTH_STAFF', 'OCCUPATIONAL_PHYSICIAN'
      )
  );
$$;
create or replace function public.can_register_hospital_patient()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_organization_access access
    where access.user_id = (select auth.uid())
      and access.active
      and access.role in ('HOSPITAL_ADMIN', 'OCCUPATIONAL_HEALTH_STAFF')
  );
$$;
alter table public.hospital_patients enable row level security;
alter table public.audiogram_pretest_assessments enable row level security;
alter table public.audiogram_history_responses enable row level security;
alter table public.audiogram_otoscopy_findings enable row level security;
create policy hospital_patients_clinical_read
on public.hospital_patients for select to public
using (public.is_hospital_clinical_user());
create policy hospital_patients_staff_insert
on public.hospital_patients for insert to public
with check (public.can_register_hospital_patient());
create policy audiogram_pretest_clinical_read
on public.audiogram_pretest_assessments for select to public
using (
  public.is_hospital_clinical_user()
  and public.can_access_organization(organization_id)
);
create policy audiogram_pretest_staff_write
on public.audiogram_pretest_assessments for all to public
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy audiogram_history_clinical_read
on public.audiogram_history_responses for select to public
using (
  public.is_hospital_clinical_user()
  and exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_history_responses.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
);
create policy audiogram_history_staff_write
on public.audiogram_history_responses for all to public
using (
  exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_history_responses.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
)
with check (
  exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_history_responses.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
);
create policy audiogram_otoscopy_clinical_read
on public.audiogram_otoscopy_findings for select to public
using (
  public.is_hospital_clinical_user()
  and exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_otoscopy_findings.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
);
create policy audiogram_otoscopy_staff_write
on public.audiogram_otoscopy_findings for all to public
using (
  exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_otoscopy_findings.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
)
with check (
  exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_otoscopy_findings.audiogram_id
      and public.can_manage_organization(audiogram.organization_id)
  )
);
drop policy if exists audiograms_authorized_read on public.audiograms;
create policy audiograms_authorized_read
on public.audiograms for select to public
using (
  public.can_access_organization(organization_id)
  and (record_status = 'FINAL' or public.is_hospital_clinical_user())
);
drop policy if exists audiogram_thresholds_authorized_read on public.audiogram_thresholds;
create policy audiogram_thresholds_authorized_read
on public.audiogram_thresholds for select to public
using (
  exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_thresholds.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
      and (audiogram.record_status = 'FINAL' or public.is_hospital_clinical_user())
  )
);
comment on table public.hospital_patients is
  'Hospital-wide seven-digit HN identity. Company-facing read models never expose this table.';
comment on column public.audiograms.source_monitoring_audiogram_id is
  'Explicit origin for repeat/confirmation records; date guessing is not clinical evidence.';
comment on column public.audiogram_thresholds.response_status is
  'MEASURED, NO_RESPONSE, or NOT_TESTED. Missing observations are never converted to zero.';
create or replace function public.register_hospital_employee(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_organization_id uuid := (p_payload ->> 'organizationId')::uuid;
  target_department_id uuid := nullif(p_payload ->> 'departmentId', '')::uuid;
  normalized_hn text := btrim(p_payload ->> 'hospitalNumber');
  patient_record public.hospital_patients%rowtype;
  employee_record public.employees%rowtype;
begin
  if not public.can_register_hospital_patient()
    or not public.can_manage_organization(target_organization_id)
  then
    raise exception 'Not authorized to register this hospital employee' using errcode = '42501';
  end if;
  if normalized_hn !~ '^[0-9]{7}$' then
    raise exception 'Hospital number must contain exactly seven digits' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload ->> 'employeeNumber'), '') is null
    or nullif(btrim(p_payload ->> 'firstName'), '') is null
    or nullif(btrim(p_payload ->> 'lastName'), '') is null
  then
    raise exception 'Employee number, first name, and last name are required' using errcode = '22023';
  end if;
  if target_department_id is not null and not exists (
    select 1 from public.departments department
    where department.id = target_department_id
      and department.organization_id = target_organization_id
  ) then
    raise exception 'Department is outside the selected organization' using errcode = '23514';
  end if;

  insert into public.hospital_patients (hospital_number)
  values (normalized_hn)
  on conflict (hospital_number) do update
    set hospital_number = excluded.hospital_number
  returning * into patient_record;

  select * into employee_record
  from public.employees employee
  where employee.organization_id = target_organization_id
    and employee.patient_id = patient_record.id;

  if found then
    return jsonb_build_object(
      'employeeId', employee_record.id,
      'patientId', patient_record.id,
      'hospitalNumber', patient_record.hospital_number,
      'created', false
    );
  end if;

  insert into public.employees (
    organization_id, department_id, patient_id, employee_number,
    first_name, last_name, sex, date_of_birth, job_title,
    employment_start_date, active
  ) values (
    target_organization_id,
    target_department_id,
    patient_record.id,
    btrim(p_payload ->> 'employeeNumber'),
    btrim(p_payload ->> 'firstName'),
    btrim(p_payload ->> 'lastName'),
    nullif(p_payload ->> 'sex', ''),
    nullif(p_payload ->> 'dateOfBirth', '')::date,
    nullif(btrim(p_payload ->> 'jobTitle'), ''),
    nullif(p_payload ->> 'employmentStartDate', '')::date,
    true
  ) returning * into employee_record;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_organization_id,
    'employee',
    employee_record.id,
    'HOSPITAL_EMPLOYEE_REGISTERED',
    jsonb_build_object(
      'patientId', patient_record.id,
      'hospitalNumberRegistered', true,
      'employeeNumber', employee_record.employee_number
    )
  );

  return jsonb_build_object(
    'employeeId', employee_record.id,
    'patientId', patient_record.id,
    'hospitalNumber', patient_record.hospital_number,
    'created', true
  );
end;
$$;
create or replace function public.save_paperless_audiogram_draft(
  p_audiogram_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_id uuid := p_audiogram_id;
  target_employee public.employees%rowtype;
  target_record public.audiograms%rowtype;
  threshold jsonb;
  response jsonb;
  finding jsonb;
  examined_at_value timestamptz := (p_payload ->> 'examinedAt')::timestamptz;
  action_name text;
begin
  select * into target_employee
  from public.employees
  where id = (p_payload ->> 'employeeId')::uuid;
  if not found or not public.can_manage_organization(target_employee.organization_id) then
    raise exception 'Not authorized to manage this audiogram' using errcode = '42501';
  end if;
  if target_employee.patient_id is null then
    raise exception 'A seven-digit hospital number must be assigned before manual audiometry' using errcode = '23514';
  end if;
  if examined_at_value is null then
    raise exception 'Exam date and time are required' using errcode = '22023';
  end if;

  if target_id is null then
    insert into public.audiograms (
      organization_id, employee_id, exam_date, examined_at, exam_type,
      record_status, test_context, hours_since_noise_exposure,
      audiometer_model, audiometer_serial, calibration_date,
      examiner, location, is_valid, validation_notes,
      source_monitoring_audiogram_id, follow_up_case_id, supersedes_audiogram_id
    ) values (
      target_employee.organization_id,
      target_employee.id,
      (examined_at_value at time zone 'Asia/Bangkok')::date,
      examined_at_value,
      p_payload ->> 'examType',
      'DRAFT',
      nullif(btrim(p_payload ->> 'testContext'), ''),
      nullif(p_payload ->> 'hoursSinceNoiseExposure', '')::numeric,
      nullif(btrim(p_payload ->> 'audiometerModel'), ''),
      nullif(btrim(p_payload ->> 'audiometerSerial'), ''),
      nullif(p_payload ->> 'calibrationDate', '')::date,
      nullif(btrim(p_payload ->> 'examiner'), ''),
      nullif(btrim(p_payload ->> 'location'), ''),
      coalesce((p_payload ->> 'isValid')::boolean, true),
      nullif(btrim(p_payload ->> 'validationNotes'), ''),
      nullif(p_payload ->> 'sourceMonitoringAudiogramId', '')::uuid,
      nullif(p_payload ->> 'followUpCaseId', '')::uuid,
      nullif(p_payload ->> 'supersedesAudiogramId', '')::uuid
    ) returning * into target_record;
    target_id := target_record.id;
    action_name := 'PAPERLESS_AUDIOGRAM_DRAFT_CREATED';
  else
    select * into target_record
    from public.audiograms
    where id = target_id
    for update;
    if not found
      or target_record.employee_id <> target_employee.id
      or target_record.organization_id <> target_employee.organization_id
      or target_record.record_status <> 'DRAFT'
    then
      raise exception 'Only the matching draft audiogram can be edited' using errcode = '23514';
    end if;
    update public.audiograms
    set exam_date = (examined_at_value at time zone 'Asia/Bangkok')::date,
        examined_at = examined_at_value,
        exam_type = p_payload ->> 'examType',
        test_context = nullif(btrim(p_payload ->> 'testContext'), ''),
        hours_since_noise_exposure = nullif(p_payload ->> 'hoursSinceNoiseExposure', '')::numeric,
        audiometer_model = nullif(btrim(p_payload ->> 'audiometerModel'), ''),
        audiometer_serial = nullif(btrim(p_payload ->> 'audiometerSerial'), ''),
        calibration_date = nullif(p_payload ->> 'calibrationDate', '')::date,
        examiner = nullif(btrim(p_payload ->> 'examiner'), ''),
        location = nullif(btrim(p_payload ->> 'location'), ''),
        is_valid = coalesce((p_payload ->> 'isValid')::boolean, true),
        validation_notes = nullif(btrim(p_payload ->> 'validationNotes'), ''),
        source_monitoring_audiogram_id = nullif(p_payload ->> 'sourceMonitoringAudiogramId', '')::uuid,
        follow_up_case_id = nullif(p_payload ->> 'followUpCaseId', '')::uuid,
        updated_at = timezone('utc', now())
    where id = target_id;
    action_name := 'PAPERLESS_AUDIOGRAM_DRAFT_UPDATED';
  end if;

  delete from public.audiogram_thresholds where audiogram_id = target_id;
  for threshold in select * from jsonb_array_elements(coalesce(p_payload -> 'thresholds', '[]'::jsonb))
  loop
    if threshold ->> 'responseStatus' = 'MEASURED' then
      insert into public.audiogram_thresholds (
        audiogram_id, ear, frequency_hz, response_status, threshold_db_hl
      ) values (
        target_id, threshold ->> 'ear', (threshold ->> 'frequencyHz')::integer,
        'MEASURED', (threshold ->> 'thresholdDbHl')::numeric
      );
    elsif threshold ->> 'responseStatus' = 'NO_RESPONSE' then
      insert into public.audiogram_thresholds (
        audiogram_id, ear, frequency_hz, response_status, no_response_at_db_hl
      ) values (
        target_id, threshold ->> 'ear', (threshold ->> 'frequencyHz')::integer,
        'NO_RESPONSE', (threshold ->> 'noResponseAtDbHl')::numeric
      );
    elsif threshold ->> 'responseStatus' = 'NOT_TESTED' then
      insert into public.audiogram_thresholds (
        audiogram_id, ear, frequency_hz, response_status
      ) values (
        target_id, threshold ->> 'ear', (threshold ->> 'frequencyHz')::integer,
        'NOT_TESTED'
      );
    else
      raise exception 'Invalid threshold response status' using errcode = '22023';
    end if;
  end loop;

  insert into public.audiogram_pretest_assessments (
    audiogram_id, organization_id, employee_id, questionnaire_version,
    quiet_period_answer, quiet_period_hours, hearing_protection_during_quiet,
    high_nonoccupational_noise, general_notes, completed_by, completed_at
  ) values (
    target_id, target_employee.organization_id, target_employee.id, 'OCC_AUDIO_V1',
    coalesce(p_payload #>> '{pretest,quietPeriodAnswer}', 'UNKNOWN'),
    nullif(p_payload #>> '{pretest,quietPeriodHours}', '')::numeric,
    coalesce(p_payload #>> '{pretest,hearingProtectionDuringQuiet}', 'UNKNOWN'),
    coalesce(p_payload #>> '{pretest,highNonoccupationalNoise}', 'UNKNOWN'),
    nullif(btrim(p_payload #>> '{pretest,generalNotes}'), ''),
    auth.uid(), timezone('utc', now())
  )
  on conflict (audiogram_id) do update
    set quiet_period_answer = excluded.quiet_period_answer,
        quiet_period_hours = excluded.quiet_period_hours,
        hearing_protection_during_quiet = excluded.hearing_protection_during_quiet,
        high_nonoccupational_noise = excluded.high_nonoccupational_noise,
        general_notes = excluded.general_notes,
        completed_by = auth.uid(),
        completed_at = timezone('utc', now());

  delete from public.audiogram_history_responses where audiogram_id = target_id;
  for response in select * from jsonb_array_elements(coalesce(p_payload -> 'historyResponses', '[]'::jsonb))
  loop
    insert into public.audiogram_history_responses (
      audiogram_id, question_code, answer, ear_scope, details
    ) values (
      target_id,
      response ->> 'questionCode',
      response ->> 'answer',
      nullif(response ->> 'earScope', ''),
      nullif(btrim(response ->> 'details'), '')
    );
  end loop;

  delete from public.audiogram_otoscopy_findings where audiogram_id = target_id;
  for finding in select * from jsonb_array_elements(coalesce(p_payload -> 'otoscopyFindings', '[]'::jsonb))
  loop
    insert into public.audiogram_otoscopy_findings (
      audiogram_id, ear, examination_status, canal_obstruction,
      abnormal_tympanic_membrane, perforation, other_finding, notes
    ) values (
      target_id,
      finding ->> 'ear',
      finding ->> 'examinationStatus',
      coalesce((finding ->> 'canalObstruction')::boolean, false),
      coalesce((finding ->> 'abnormalTympanicMembrane')::boolean, false),
      coalesce((finding ->> 'perforation')::boolean, false),
      coalesce((finding ->> 'otherFinding')::boolean, false),
      nullif(btrim(finding ->> 'notes'), '')
    );
  end loop;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_employee.organization_id, 'audiogram', target_id, action_name,
    jsonb_build_object(
      'recordStatus', 'DRAFT',
      'examType', p_payload ->> 'examType',
      'thresholdObservationCount', jsonb_array_length(coalesce(p_payload -> 'thresholds', '[]'::jsonb))
    )
  );

  return target_id;
end;
$$;
create or replace function public.finalize_paperless_audiogram(
  p_audiogram_id uuid,
  p_thai_evaluation jsonb,
  p_osha_evaluation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  draft_record public.audiograms%rowtype;
  source_record public.audiograms%rowtype;
  superseded_record public.audiograms%rowtype;
  active_baseline public.hearing_baseline_history%rowtype;
  thai_rule public.rule_sets%rowtype;
  osha_rule public.rule_sets%rowtype;
  thai_evaluation_id uuid;
  osha_evaluation_id uuid;
  follow_up_id uuid;
  old_thai_status text;
  old_thai_findings jsonb;
  new_thai_status text := upper(coalesce(p_thai_evaluation ->> 'status', ''));
  new_thai_findings jsonb := coalesce(p_thai_evaluation -> 'triggeredFindings', '[]'::jsonb);
  observation_count integer;
  history_count integer;
  otoscopy_count integer;
  invalid_step_count integer;
begin
  select * into draft_record
  from public.audiograms
  where id = p_audiogram_id
  for update;

  if not found or draft_record.record_status <> 'DRAFT' then
    raise exception 'Only a draft audiogram can be finalized' using errcode = '23514';
  end if;
  if not public.can_manage_organization(draft_record.organization_id) then
    raise exception 'Not authorized to finalize this audiogram' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.employees employee
    where employee.id = draft_record.employee_id
      and employee.organization_id = draft_record.organization_id
      and employee.patient_id is not null
  ) then
    raise exception 'A seven-digit hospital number is required before finalization' using errcode = '23514';
  end if;
  if draft_record.examiner is null
    or draft_record.location is null
    or draft_record.audiometer_model is null
    or draft_record.audiometer_serial is null
    or draft_record.calibration_date is null
  then
    raise exception 'Examiner, location, audiometer model/serial, and calibration date are required' using errcode = '23514';
  end if;
  if draft_record.calibration_date > draft_record.exam_date then
    raise exception 'Calibration date cannot be after the examination date' using errcode = '23514';
  end if;

  select count(*), count(*) filter (
    where response_status in ('MEASURED', 'NO_RESPONSE')
      and mod(coalesce(threshold_db_hl, no_response_at_db_hl), 5) <> 0
  )
  into observation_count, invalid_step_count
  from public.audiogram_thresholds
  where audiogram_id = draft_record.id;

  if observation_count <> 14 then
    raise exception 'Final audiogram requires all 14 threshold observations' using errcode = '23514';
  end if;
  if invalid_step_count <> 0 then
    raise exception 'Manual measured and no-response levels must use 5 dB steps' using errcode = '23514';
  end if;

  select count(*) into history_count
  from public.audiogram_history_responses
  where audiogram_id = draft_record.id;
  select count(*) into otoscopy_count
  from public.audiogram_otoscopy_findings
  where audiogram_id = draft_record.id;
  if not exists (
    select 1 from public.audiogram_pretest_assessments
    where audiogram_id = draft_record.id
  ) or history_count <> 21 or otoscopy_count <> 2 then
    raise exception 'Final audiogram requires the complete pretest questionnaire and bilateral otoscopy status' using errcode = '23514';
  end if;

  if draft_record.exam_type in ('REPEAT', 'CONFIRMATION') then
    if draft_record.source_monitoring_audiogram_id is null
      or draft_record.follow_up_case_id is null
    then
      raise exception 'Repeat and confirmation records require an explicit monitoring audiogram and follow-up case' using errcode = '23514';
    end if;
    select * into source_record
    from public.audiograms
    where id = draft_record.source_monitoring_audiogram_id
      and employee_id = draft_record.employee_id
      and organization_id = draft_record.organization_id
      and exam_type = 'ANNUAL'
      and record_status = 'FINAL';
    if not found then
      raise exception 'The source monitoring audiogram is not an eligible final annual record' using errcode = '23514';
    end if;
    if draft_record.exam_date < source_record.exam_date
      or draft_record.exam_date > source_record.exam_date + 30
    then
      raise exception 'Repeat or confirmation must be dated from day 0 through day 30 of monitoring' using errcode = '23514';
    end if;
    if draft_record.exam_type = 'REPEAT' and draft_record.exam_date <> source_record.exam_date then
      raise exception 'Immediate retest must be performed on the monitoring date' using errcode = '23514';
    end if;
  elsif draft_record.source_monitoring_audiogram_id is not null
    or draft_record.follow_up_case_id is not null
  then
    raise exception 'Only repeat or confirmation records may link to a monitoring case' using errcode = '23514';
  end if;

  if draft_record.supersedes_audiogram_id is not null then
    select * into superseded_record
    from public.audiograms
    where id = draft_record.supersedes_audiogram_id
      and employee_id = draft_record.employee_id
      and organization_id = draft_record.organization_id
      and record_status = 'FINAL'
    for update;
    if not found then
      raise exception 'The correction source is not an active final audiogram' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.hearing_baseline_history history
      where history.baseline_audiogram_id = superseded_record.id
        and history.status = 'ACTIVE'
    ) then
      raise exception 'An active baseline cannot be corrected outside baseline governance' using errcode = '23514';
    end if;
    update public.audiograms
    set record_status = 'SUPERSEDED', updated_at = timezone('utc', now())
    where id = superseded_record.id;

    select evaluation.status, evaluation.evaluation_result_json -> 'triggeredFindings'
    into old_thai_status, old_thai_findings
    from public.surveillance_evaluations evaluation
    join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
    where evaluation.current_audiogram_id = superseded_record.id
      and rule_set.code = 'THAI_HEARING_2561'
    order by evaluation.evaluated_at desc
    limit 1;
  end if;

  update public.audiograms
  set record_status = 'FINAL',
      finalized_at = timezone('utc', now()),
      finalized_by = auth.uid(),
      updated_at = timezone('utc', now())
  where id = draft_record.id;

  select * into active_baseline
  from public.hearing_baseline_history
  where employee_id = draft_record.employee_id
    and organization_id = draft_record.organization_id
    and framework_or_context = 'THAI_OPERATIONAL'
    and ear_scope = 'BOTH'
    and status = 'ACTIVE'
  limit 1;

  if draft_record.exam_type not in ('BASELINE', 'OTHER') then
    if p_thai_evaluation is null or p_osha_evaluation is null
      or new_thai_status not in ('NEGATIVE', 'POSITIVE', 'NOT_EVALUABLE')
      or upper(coalesce(p_osha_evaluation ->> 'status', '')) not in ('NEGATIVE', 'POSITIVE', 'NOT_EVALUABLE')
    then
      raise exception 'Final surveillance records require valid Thai and OSHA evaluation snapshots' using errcode = '23514';
    end if;

    select * into thai_rule from public.rule_sets
    where code = 'THAI_HEARING_2561' and version = p_thai_evaluation ->> 'ruleVersion';
    select * into osha_rule from public.rule_sets
    where code = 'OSHA_STS_29_CFR_1910_95' and version = p_osha_evaluation ->> 'ruleVersion';
    if thai_rule.id is null or osha_rule.id is null then
      raise exception 'Required versioned rule metadata is missing' using errcode = '23514';
    end if;

    insert into public.surveillance_evaluations (
      organization_id, employee_id, current_audiogram_id,
      baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
      status, evaluation_result_json, analysis_mode, supersedes_evaluation_id,
      evaluated_at
    ) values (
      draft_record.organization_id, draft_record.employee_id, draft_record.id,
      active_baseline.baseline_audiogram_id, active_baseline.id,
      thai_rule.id, thai_rule.version, new_thai_status, p_thai_evaluation,
      case when draft_record.supersedes_audiogram_id is null then 'PROSPECTIVE' else 'RETROSPECTIVE_REANALYSIS' end,
      case when draft_record.supersedes_audiogram_id is null then null else (
        select evaluation.id from public.surveillance_evaluations evaluation
        join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
        where evaluation.current_audiogram_id = draft_record.supersedes_audiogram_id
          and rule_set.code = 'THAI_HEARING_2561'
        order by evaluation.evaluated_at desc limit 1
      ) end,
      timezone('utc', now())
    ) returning id into thai_evaluation_id;

    insert into public.surveillance_evaluations (
      organization_id, employee_id, current_audiogram_id,
      baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
      status, evaluation_result_json, analysis_mode, supersedes_evaluation_id,
      evaluated_at
    ) values (
      draft_record.organization_id, draft_record.employee_id, draft_record.id,
      active_baseline.baseline_audiogram_id, active_baseline.id,
      osha_rule.id, osha_rule.version, upper(p_osha_evaluation ->> 'status'), p_osha_evaluation,
      case when draft_record.supersedes_audiogram_id is null then 'PROSPECTIVE' else 'RETROSPECTIVE_REANALYSIS' end,
      case when draft_record.supersedes_audiogram_id is null then null else (
        select evaluation.id from public.surveillance_evaluations evaluation
        join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
        where evaluation.current_audiogram_id = draft_record.supersedes_audiogram_id
          and rule_set.code = 'OSHA_STS_29_CFR_1910_95'
        order by evaluation.evaluated_at desc limit 1
      ) end,
      timezone('utc', now())
    ) returning id into osha_evaluation_id;

    if draft_record.exam_type = 'ANNUAL' and new_thai_status = 'POSITIVE' then
      insert into public.follow_up_cases (
        organization_id, employee_id, trigger_evaluation_id, status, priority,
        detected_date, repeat_due_date
      ) values (
        draft_record.organization_id, draft_record.employee_id, thai_evaluation_id,
        'REPEAT_REQUIRED', 'NORMAL', draft_record.exam_date, draft_record.exam_date + 30
      )
      on conflict (trigger_evaluation_id) do nothing
      returning id into follow_up_id;
    elsif draft_record.exam_type in ('REPEAT', 'CONFIRMATION') then
      update public.follow_up_cases
      set status = case when status = 'REPEAT_REQUIRED' then 'REPEAT_COMPLETED' else status end,
          repeat_completed_date = coalesce(repeat_completed_date, draft_record.exam_date),
          updated_at = timezone('utc', now())
      where id = draft_record.follow_up_case_id
        and employee_id = draft_record.employee_id
        and organization_id = draft_record.organization_id
      returning id into follow_up_id;
      if follow_up_id is null then
        raise exception 'The linked follow-up case is outside this employee scope' using errcode = '23514';
      end if;
    end if;

    if superseded_record.id is not null
      and (old_thai_status is distinct from new_thai_status
        or old_thai_findings is distinct from new_thai_findings)
    then
      update public.follow_up_cases
      set reconciliation_required = true,
          reconciliation_reason = 'A finalized audiogram correction changed the Thai clinical evaluation and requires physician reconciliation.',
          updated_at = timezone('utc', now())
      where trigger_evaluation_id in (
        select evaluation.id
        from public.surveillance_evaluations evaluation
        join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
        where evaluation.current_audiogram_id = superseded_record.id
          and rule_set.code = 'THAI_HEARING_2561'
      );
    end if;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    draft_record.organization_id,
    'audiogram',
    draft_record.id,
    case when draft_record.supersedes_audiogram_id is null
      then 'PAPERLESS_AUDIOGRAM_FINALIZED'
      else 'PAPERLESS_AUDIOGRAM_CORRECTION_FINALIZED'
    end,
    jsonb_build_object(
      'recordStatus', 'FINAL',
      'examType', draft_record.exam_type,
      'supersedesAudiogramId', draft_record.supersedes_audiogram_id,
      'thaiEvaluationId', thai_evaluation_id,
      'oshaEvaluationId', osha_evaluation_id,
      'followUpCaseId', coalesce(follow_up_id, draft_record.follow_up_case_id),
      'nioshAutomaticallyChangedBaseline', false,
      'nioshAutomaticallyMutatedThaiFollowUp', false
    )
  );

  return jsonb_build_object(
    'audiogramId', draft_record.id,
    'recordStatus', 'FINAL',
    'thaiEvaluationId', thai_evaluation_id,
    'oshaEvaluationId', osha_evaluation_id,
    'followUpCaseId', coalesce(follow_up_id, draft_record.follow_up_case_id)
  );
end;
$$;
create or replace function public.propose_initial_thai_baseline(p_audiogram_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  candidate public.audiograms%rowtype;
  suggestion_id uuid;
begin
  select * into candidate
  from public.audiograms
  where id = p_audiogram_id;
  if not found or not public.can_manage_organization(candidate.organization_id) then
    raise exception 'Not authorized to propose this baseline' using errcode = '42501';
  end if;
  if candidate.record_status <> 'FINAL' or candidate.exam_type <> 'BASELINE' or not candidate.is_valid then
    raise exception 'Initial baseline candidate must be a valid final baseline examination' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.audiogram_thresholds threshold
    where threshold.audiogram_id = candidate.id
      and threshold.response_status <> 'MEASURED'
  ) or (select count(*) from public.audiogram_thresholds where audiogram_id = candidate.id) <> 14 then
    raise exception 'Initial baseline candidate requires 14 measured thresholds' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.hearing_baseline_history history
    where history.employee_id = candidate.employee_id
      and history.organization_id = candidate.organization_id
      and history.framework_or_context = 'THAI_OPERATIONAL'
      and history.status = 'ACTIVE'
  ) then
    raise exception 'An active Thai operational baseline already exists' using errcode = '23514';
  end if;

  insert into public.baseline_interpretation_suggestions (
    organization_id, employee_id, framework, suggestion_type,
    qualitative_state, ear_scope, monitoring_audiogram_id,
    candidate_audiogram_id, evidence_json, explanation, required_action,
    automatic_baseline_change, thai_follow_up_mutation
  ) values (
    candidate.organization_id, candidate.employee_id, 'THAI',
    'THAI_INITIAL_BASELINE_CANDIDATE', 'REVIEW_REQUIRED', 'BOTH', null,
    candidate.id,
    jsonb_build_object(
      'candidateAudiogramId', candidate.id,
      'examDate', candidate.exam_date,
      'measuredThresholdCount', 14
    ),
    'A valid final baseline examination is proposed as the employee''s first Thai operational baseline.',
    'Assigned occupational physician approval is required before this baseline becomes operational.',
    false, false
  )
  on conflict do nothing
  returning id into suggestion_id;

  if suggestion_id is null then
    select id into suggestion_id
    from public.baseline_interpretation_suggestions
    where employee_id = candidate.employee_id
      and suggestion_type = 'THAI_INITIAL_BASELINE_CANDIDATE'
      and candidate_audiogram_id = candidate.id;
  end if;
  return suggestion_id;
end;
$$;
create or replace function public.review_baseline_suggestion(
  p_suggestion_id uuid,
  p_decision text,
  p_review_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  suggestion_record public.baseline_interpretation_suggestions%rowtype;
  previous_baseline public.hearing_baseline_history%rowtype;
  candidate_record public.audiograms%rowtype;
  new_baseline_id uuid;
  normalized_decision text := upper(btrim(p_decision));
  new_review_status text;
  baseline_context text;
  thai_operational_changed boolean := false;
begin
  if normalized_decision not in ('APPROVE', 'REJECT', 'DEFER') then
    raise exception 'Decision must be APPROVE, REJECT, or DEFER' using errcode = '22023';
  end if;
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'A physician review note is required' using errcode = '22023';
  end if;

  select * into suggestion_record
  from public.baseline_interpretation_suggestions
  where id = p_suggestion_id
  for update;
  if not found then
    raise exception 'Baseline suggestion not found' using errcode = 'P0002';
  end if;
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.can_review_baseline(suggestion_record.organization_id)
  ) then
    raise exception 'Only an assigned occupational physician may review this suggestion' using errcode = '42501';
  end if;
  if suggestion_record.review_status not in ('PENDING', 'DEFERRED')
    or suggestion_record.superseded_by_suggestion_id is not null
  then
    raise exception 'This suggestion is no longer available for a final review decision' using errcode = '23514';
  end if;

  new_review_status := case normalized_decision
    when 'APPROVE' then 'APPROVED'
    when 'REJECT' then 'REJECTED'
    else 'DEFERRED'
  end;

  if normalized_decision = 'APPROVE'
    and suggestion_record.suggestion_type in (
      'THAI_INITIAL_BASELINE_CANDIDATE',
      'OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS',
      'OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT'
    )
  then
    if suggestion_record.candidate_audiogram_id is null then
      raise exception 'A baseline candidate requires a candidate audiogram' using errcode = '23514';
    end if;
    select * into candidate_record
    from public.audiograms
    where id = suggestion_record.candidate_audiogram_id
      and employee_id = suggestion_record.employee_id
      and organization_id = suggestion_record.organization_id
      and record_status = 'FINAL';
    if not found then
      raise exception 'Candidate audiogram is outside the suggestion scope or is not final' using errcode = '23514';
    end if;

    if suggestion_record.suggestion_type = 'THAI_INITIAL_BASELINE_CANDIDATE' then
      if candidate_record.exam_type <> 'BASELINE' or not candidate_record.is_valid
        or exists (
          select 1 from public.audiogram_thresholds threshold
          where threshold.audiogram_id = candidate_record.id
            and threshold.response_status <> 'MEASURED'
        )
        or (select count(*) from public.audiogram_thresholds where audiogram_id = candidate_record.id) <> 14
      then
        raise exception 'Thai initial baseline candidate is no longer eligible' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.hearing_baseline_history history
        where history.employee_id = suggestion_record.employee_id
          and history.organization_id = suggestion_record.organization_id
          and history.framework_or_context = 'THAI_OPERATIONAL'
          and history.status = 'ACTIVE'
      ) then
        raise exception 'An active Thai operational baseline already exists' using errcode = '23514';
      end if;
      baseline_context := 'THAI_OPERATIONAL';
      thai_operational_changed := true;
    else
      baseline_context := 'OSHA_ANALYTICAL';
      for previous_baseline in
        update public.hearing_baseline_history
        set status = 'SUPERSEDED',
            effective_to = candidate_record.exam_date,
            updated_at = timezone('utc', now())
        where employee_id = suggestion_record.employee_id
          and organization_id = suggestion_record.organization_id
          and ear_scope = suggestion_record.ear_scope
          and framework_or_context = baseline_context
          and status = 'ACTIVE'
        returning *
      loop
        insert into public.audit_logs (
          organization_id, entity_type, entity_id, action, old_values_json, new_values_json
        ) values (
          suggestion_record.organization_id,
          'hearing_baseline_history', previous_baseline.id,
          'BASELINE_VERSION_SUPERSEDED',
          jsonb_build_object('status', 'ACTIVE', 'baselineAudiogramId', previous_baseline.baseline_audiogram_id),
          jsonb_build_object('status', 'SUPERSEDED', 'effectiveTo', candidate_record.exam_date)
        );
      end loop;
    end if;

    insert into public.hearing_baseline_history (
      organization_id, employee_id, baseline_audiogram_id, ear_scope,
      framework_or_context, status, reason_code, reason_text,
      source_suggestion_id, approved_by, approved_at, effective_from
    ) values (
      suggestion_record.organization_id,
      suggestion_record.employee_id,
      suggestion_record.candidate_audiogram_id,
      suggestion_record.ear_scope,
      baseline_context,
      'ACTIVE',
      suggestion_record.suggestion_type,
      btrim(p_review_note),
      suggestion_record.id,
      auth.uid(),
      timezone('utc', now()),
      candidate_record.exam_date
    ) returning id into new_baseline_id;

    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action, new_values_json
    ) values (
      suggestion_record.organization_id,
      'hearing_baseline_history', new_baseline_id,
      'BASELINE_VERSION_ACTIVATED',
      jsonb_build_object(
        'frameworkOrContext', baseline_context,
        'earScope', suggestion_record.ear_scope,
        'baselineAudiogramId', suggestion_record.candidate_audiogram_id,
        'sourceSuggestionId', suggestion_record.id,
        'thaiOperationalBaselineChanged', thai_operational_changed
      )
    );
  end if;

  update public.baseline_interpretation_suggestions
  set review_status = new_review_status,
      reviewed_by = auth.uid(),
      reviewed_by_email = nullif(auth.jwt() ->> 'email', ''),
      reviewed_at = timezone('utc', now()),
      review_note = btrim(p_review_note)
  where id = p_suggestion_id;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, old_values_json, new_values_json
  ) values (
    suggestion_record.organization_id,
    'baseline_interpretation_suggestion', suggestion_record.id,
    case
      when suggestion_record.suggestion_type = 'THAI_INITIAL_BASELINE_CANDIDATE'
        and normalized_decision = 'APPROVE' then 'INITIAL_BASELINE_APPROVED'
      when normalized_decision = 'APPROVE' then 'BASELINE_REVISION_APPROVED'
      when normalized_decision = 'REJECT' then 'BASELINE_REVISION_REJECTED'
      else 'BASELINE_REVIEW_DEFERRED'
    end,
    jsonb_build_object('reviewStatus', suggestion_record.review_status),
    jsonb_build_object(
      'reviewStatus', new_review_status,
      'reviewNote', btrim(p_review_note),
      'newBaselineHistoryId', new_baseline_id,
      'thaiOperationalBaselineChanged', thai_operational_changed,
      'thaiFollowUpMutated', false
    )
  );

  return jsonb_build_object(
    'suggestionId', suggestion_record.id,
    'reviewStatus', new_review_status,
    'newBaselineHistoryId', new_baseline_id,
    'thaiOperationalBaselineChanged', thai_operational_changed,
    'thaiFollowUpMutated', false
  );
end;
$$;
-- The existing directory keeps its public column contract; monitoring is now
-- optional only for an initial Thai baseline proposal.
create or replace view public.baseline_governance_directory
with (security_invoker = true)
as
select
  suggestion.id,
  suggestion.organization_id,
  organization.code as organization_code,
  organization.name as organization_name,
  organization.name_th as organization_name_th,
  suggestion.employee_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  suggestion.framework,
  suggestion.suggestion_type,
  suggestion.qualitative_state,
  suggestion.ear_scope,
  suggestion.active_baseline_history_id,
  active_baseline.baseline_audiogram_id as active_baseline_audiogram_id,
  active_baseline_audiogram.exam_date as active_baseline_date,
  suggestion.monitoring_audiogram_id,
  monitoring_audiogram.exam_date as monitoring_date,
  suggestion.immediate_retest_audiogram_id,
  immediate_retest.exam_date as immediate_retest_date,
  suggestion.confirmation_audiogram_id,
  confirmation.exam_date as confirmation_date,
  confirmation.hours_since_noise_exposure as confirmation_quiet_hours,
  suggestion.candidate_audiogram_id,
  candidate.exam_date as candidate_date,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', history.id,
        'baselineAudiogramId', history.baseline_audiogram_id,
        'baselineDate', history_audiogram.exam_date,
        'earScope', history.ear_scope,
        'frameworkOrContext', history.framework_or_context,
        'status', history.status,
        'reasonCode', history.reason_code,
        'reasonText', history.reason_text,
        'sourceSuggestionId', history.source_suggestion_id,
        'approvedBy', history.approved_by,
        'approvedAt', history.approved_at,
        'effectiveFrom', history.effective_from,
        'effectiveTo', history.effective_to,
        'createdAt', history.created_at
      ) order by history.effective_from desc, history.created_at desc
    )
    from public.hearing_baseline_history history
    join public.audiograms history_audiogram on history_audiogram.id = history.baseline_audiogram_id
    where history.organization_id = suggestion.organization_id
      and history.employee_id = suggestion.employee_id
  ), '[]'::jsonb) as baseline_history_json,
  suggestion.evidence_json,
  suggestion.explanation,
  suggestion.required_action,
  suggestion.automatic_baseline_change,
  suggestion.thai_follow_up_mutation,
  suggestion.review_status,
  suggestion.created_by,
  suggestion.created_by_email,
  suggestion.reviewed_by,
  suggestion.reviewed_by_email,
  suggestion.reviewed_at,
  suggestion.review_note,
  suggestion.created_at,
  suggestion.updated_at
from public.baseline_interpretation_suggestions suggestion
join public.organizations organization on organization.id = suggestion.organization_id
join public.employees employee on employee.id = suggestion.employee_id
left join public.hearing_baseline_history active_baseline on active_baseline.id = suggestion.active_baseline_history_id
left join public.audiograms active_baseline_audiogram on active_baseline_audiogram.id = active_baseline.baseline_audiogram_id
left join public.audiograms monitoring_audiogram on monitoring_audiogram.id = suggestion.monitoring_audiogram_id
left join public.audiograms immediate_retest on immediate_retest.id = suggestion.immediate_retest_audiogram_id
left join public.audiograms confirmation on confirmation.id = suggestion.confirmation_audiogram_id
left join public.audiograms candidate on candidate.id = suggestion.candidate_audiogram_id;
comment on function public.finalize_paperless_audiogram(uuid, jsonb, jsonb) is
  'Atomically locks a complete draft, persists immutable Thai/OSHA snapshots, and links the existing Thai follow-up workflow.';

-- 20260813010000_phase9_paperless_read_models.sql

-- Phase 9 follow-up: final-only operational directories, hospital-only
-- paperless directories, and RPC-only writes for immutable clinical records.

create or replace view public.audiogram_directory
with (security_invoker = true)
as
select
  audiogram.id,
  audiogram.organization_id,
  audiogram.employee_id,
  audiogram.exam_date,
  audiogram.exam_type,
  audiogram.is_valid,
  audiogram.validation_notes,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.department_id,
  organization.name as organization_name,
  department.name as department_name,
  (
    select count(*)::integer
    from public.audiogram_thresholds threshold
    where threshold.audiogram_id = audiogram.id
  ) as threshold_count
from public.audiograms audiogram
join public.employees employee on employee.id = audiogram.employee_id
join public.organizations organization on organization.id = audiogram.organization_id
left join public.departments department on department.id = employee.department_id
where audiogram.record_status = 'FINAL';
create or replace view public.audiogram_year_directory
with (security_invoker = true)
as
select distinct
  audiogram.organization_id,
  extract(year from audiogram.exam_date)::integer as exam_year
from public.audiograms audiogram
where audiogram.record_status = 'FINAL';
create or replace view public.hospital_employee_directory
with (security_invoker = true)
as
select
  employee.id,
  employee.organization_id,
  employee.department_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.sex,
  employee.date_of_birth,
  employee.job_title,
  employee.employment_start_date,
  employee.active,
  patient.hospital_number,
  organization.name as organization_name,
  department.name as department_name
from public.employees employee
join public.hospital_patients patient on patient.id = employee.patient_id
join public.organizations organization on organization.id = employee.organization_id
left join public.departments department on department.id = employee.department_id;
create or replace view public.paperless_audiometry_directory
with (security_invoker = true)
as
select
  audiogram.id,
  audiogram.organization_id,
  audiogram.employee_id,
  audiogram.record_status,
  audiogram.exam_type,
  audiogram.exam_date,
  audiogram.examined_at,
  audiogram.finalized_at,
  audiogram.source_monitoring_audiogram_id,
  audiogram.follow_up_case_id,
  audiogram.supersedes_audiogram_id,
  audiogram.examiner,
  audiogram.location,
  audiogram.updated_at,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  patient.hospital_number,
  organization.name as organization_name,
  department.name as department_name,
  (
    select count(*)::integer
    from public.audiogram_thresholds threshold
    where threshold.audiogram_id = audiogram.id
  ) as observation_count
from public.audiograms audiogram
join public.employees employee on employee.id = audiogram.employee_id
join public.hospital_patients patient on patient.id = employee.patient_id
join public.organizations organization on organization.id = audiogram.organization_id
left join public.departments department on department.id = employee.department_id;
comment on view public.hospital_employee_directory is
  'Hospital-only HN directory. Company roles receive no patient rows through RLS.';
comment on view public.paperless_audiometry_directory is
  'Hospital paperless work queue including drafts and immutable record lifecycle state.';

-- 20260813020000_phase9_suggestion_sequence_refresh.sql

-- Replace the analytical suggestion layer for one explicitly linked monitoring
-- sequence without mutating the Thai baseline or follow-up workflow.

create or replace function public.replace_analytical_baseline_suggestions(
  p_suggestions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  item jsonb;
  target_monitoring_id uuid;
  target_employee_id uuid;
  target_organization_id uuid;
  inserted_id uuid;
  current_ids uuid[] := array[]::uuid[];
  old_ids uuid[] := array[]::uuid[];
  first_current_id uuid;
  created_count integer := 0;
begin
  if jsonb_typeof(p_suggestions) <> 'array'
    or jsonb_array_length(p_suggestions) = 0
  then
    return jsonb_build_object('created', 0, 'suggestionIds', '[]'::jsonb);
  end if;

  item := p_suggestions -> 0;
  target_monitoring_id := (item ->> 'monitoringAudiogramId')::uuid;
  target_employee_id := (item ->> 'employeeId')::uuid;
  target_organization_id := (item ->> 'organizationId')::uuid;

  if not exists (
    select 1 from public.audiograms monitoring
    where monitoring.id = target_monitoring_id
      and monitoring.employee_id = target_employee_id
      and monitoring.organization_id = target_organization_id
      and monitoring.exam_type = 'ANNUAL'
      and monitoring.record_status = 'FINAL'
  ) then
    raise exception 'Suggestion sequence requires an explicit final annual monitoring audiogram'
      using errcode = '23514';
  end if;
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Not authorized to refresh this suggestion sequence'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(suggestion.id), array[]::uuid[])
  into old_ids
  from public.baseline_interpretation_suggestions suggestion
  where suggestion.employee_id = target_employee_id
    and suggestion.organization_id = target_organization_id
    and suggestion.monitoring_audiogram_id = target_monitoring_id
    and suggestion.framework in ('OSHA', 'NIOSH')
    and suggestion.superseded_by_suggestion_id is null;

  for item in select value from jsonb_array_elements(p_suggestions)
  loop
    if (item ->> 'employeeId')::uuid <> target_employee_id
      or (item ->> 'organizationId')::uuid <> target_organization_id
      or (item ->> 'monitoringAudiogramId')::uuid <> target_monitoring_id
      or item ->> 'framework' not in ('OSHA', 'NIOSH')
    then
      raise exception 'All suggestions must belong to one OSHA/NIOSH monitoring sequence'
        using errcode = '23514';
    end if;

    inserted_id := null;
    insert into public.baseline_interpretation_suggestions (
      organization_id, employee_id, framework, suggestion_type,
      qualitative_state, ear_scope, active_baseline_history_id,
      monitoring_audiogram_id, immediate_retest_audiogram_id,
      confirmation_audiogram_id, candidate_audiogram_id,
      evidence_json, explanation, required_action,
      automatic_baseline_change, thai_follow_up_mutation
    ) values (
      target_organization_id,
      target_employee_id,
      item ->> 'framework',
      item ->> 'suggestionType',
      item ->> 'qualitativeState',
      item ->> 'earScope',
      nullif(item ->> 'activeBaselineHistoryId', '')::uuid,
      target_monitoring_id,
      nullif(item ->> 'immediateRetestAudiogramId', '')::uuid,
      nullif(item ->> 'confirmationAudiogramId', '')::uuid,
      nullif(item ->> 'candidateAudiogramId', '')::uuid,
      coalesce(item -> 'evidence', '{}'::jsonb),
      item ->> 'explanation',
      item ->> 'requiredAction',
      false,
      false
    )
    on conflict do nothing
    returning id into inserted_id;

    if inserted_id is not null then
      created_count := created_count + 1;
    else
      select suggestion.id into inserted_id
      from public.baseline_interpretation_suggestions suggestion
      where suggestion.employee_id = target_employee_id
        and suggestion.monitoring_audiogram_id = target_monitoring_id
        and suggestion.suggestion_type = item ->> 'suggestionType'
        and suggestion.ear_scope = item ->> 'earScope'
        and suggestion.immediate_retest_audiogram_id is not distinct from nullif(item ->> 'immediateRetestAudiogramId', '')::uuid
        and suggestion.confirmation_audiogram_id is not distinct from nullif(item ->> 'confirmationAudiogramId', '')::uuid
        and suggestion.candidate_audiogram_id is not distinct from nullif(item ->> 'candidateAudiogramId', '')::uuid;
    end if;
    if inserted_id is not null and not inserted_id = any(current_ids) then
      current_ids := array_append(current_ids, inserted_id);
    end if;
  end loop;

  first_current_id := current_ids[1];
  if first_current_id is not null then
    update public.baseline_interpretation_suggestions suggestion
    set superseded_by_suggestion_id = first_current_id,
        updated_at = timezone('utc', now())
    where suggestion.id = any(old_ids)
      and not suggestion.id = any(current_ids)
      and suggestion.superseded_by_suggestion_id is null;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_organization_id,
    'audiogram',
    target_monitoring_id,
    'ANALYTICAL_SUGGESTION_SEQUENCE_REFRESHED',
    jsonb_build_object(
      'employeeId', target_employee_id,
      'currentSuggestionIds', to_jsonb(current_ids),
      'createdCount', created_count,
      'thaiOperationalBaselineChanged', false,
      'thaiFollowUpMutated', false
    )
  );

  return jsonb_build_object(
    'created', created_count,
    'suggestionIds', to_jsonb(current_ids)
  );
end;
$$;
comment on function public.replace_analytical_baseline_suggestions(jsonb) is
  'Supersedes the prior OSHA/NIOSH suggestion layer for one explicit monitoring sequence; never mutates Thai cases or baselines.';

-- 20260813030000_phase9_fast_history_capture.sql

alter table public.audiogram_pretest_assessments
  add column history_capture_mode text not null default 'LEGACY_FULL',
  add column source_history_audiogram_id uuid,
  add column history_verified_by uuid references auth.users(id) on delete set null,
  add column history_verified_at timestamptz,
  add constraint audiogram_pretest_history_capture_mode_valid check (
    history_capture_mode in (
      'QUICK_SCREEN', 'UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR', 'LEGACY_FULL'
    )
  ),
  add constraint audiogram_pretest_history_source_same_person
    foreign key (source_history_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  add constraint audiogram_pretest_history_capture_consistent check (
    (history_capture_mode in ('QUICK_SCREEN', 'LEGACY_FULL') and source_history_audiogram_id is null)
    or (history_capture_mode in ('UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR') and source_history_audiogram_id is not null)
  ),
  add constraint audiogram_pretest_history_verification_consistent check (
    history_capture_mode = 'LEGACY_FULL'
    or (history_verified_by is not null and history_verified_at is not null)
  );
comment on column public.audiogram_pretest_assessments.history_capture_mode is
  'How the 21-response history snapshot was captured for this examination.';
comment on column public.audiogram_pretest_assessments.source_history_audiogram_id is
  'Final paperless audiogram whose history was confirmed or updated; quiet period and otoscopy are never reused.';
alter function public.save_paperless_audiogram_draft(uuid, jsonb)
  rename to save_paperless_audiogram_draft_legacy;
create or replace function public.save_paperless_audiogram_draft(
  p_audiogram_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_id uuid;
  target_record public.audiograms%rowtype;
  source_record public.audiograms%rowtype;
  capture_mode text := coalesce(
    nullif(p_payload #>> '{pretest,historyCaptureMode}', ''),
    'LEGACY_FULL'
  );
  source_history_id uuid := nullif(
    p_payload #>> '{pretest,sourceHistoryAudiogramId}',
    ''
  )::uuid;
  source_history_count integer;
begin
  if capture_mode not in (
    'QUICK_SCREEN', 'UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR', 'LEGACY_FULL'
  ) then
    raise exception 'Invalid history capture mode' using errcode = '22023';
  end if;

  if capture_mode in ('QUICK_SCREEN', 'LEGACY_FULL') and source_history_id is not null then
    raise exception 'A new history screen cannot reference a prior history record' using errcode = '23514';
  end if;
  if capture_mode in ('UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR') and source_history_id is null then
    raise exception 'Prior-history capture requires a source Final record' using errcode = '23514';
  end if;

  target_id := public.save_paperless_audiogram_draft_legacy(p_audiogram_id, p_payload);

  select * into target_record
  from public.audiograms
  where id = target_id;

  if source_history_id is not null then
    select * into source_record
    from public.audiograms
    where id = source_history_id;

    if not found
      or source_record.id = target_record.id
      or source_record.employee_id <> target_record.employee_id
      or source_record.organization_id <> target_record.organization_id
      or source_record.record_status <> 'FINAL'
      or source_record.examined_at > target_record.examined_at
    then
      raise exception 'Prior history source must be an earlier Final record for the same employee and organization'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.audiogram_pretest_assessments assessment
      where assessment.audiogram_id = source_history_id
    ) then
      raise exception 'Prior history source has no completed assessment' using errcode = '23514';
    end if;

    select count(*) into source_history_count
    from public.audiogram_history_responses history
    where history.audiogram_id = source_history_id;
    if source_history_count <> 21 then
      raise exception 'Prior history source does not contain a complete 21-response snapshot'
        using errcode = '23514';
    end if;
  end if;

  update public.audiogram_pretest_assessments
  set history_capture_mode = capture_mode,
      source_history_audiogram_id = source_history_id,
      history_verified_by = case when capture_mode = 'LEGACY_FULL' then null else auth.uid() end,
      history_verified_at = case when capture_mode = 'LEGACY_FULL' then null else timezone('utc', now()) end
  where audiogram_id = target_id;

  if capture_mode = 'UNCHANGED_FROM_PRIOR' then
    delete from public.audiogram_history_responses
    where audiogram_id = target_id;

    insert into public.audiogram_history_responses (
      audiogram_id, question_code, answer, ear_scope, details
    )
    select
      target_id, question_code, answer, ear_scope, details
    from public.audiogram_history_responses
    where audiogram_id = source_history_id;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_record.organization_id,
    'audiogram',
    target_id,
    'PAPERLESS_HISTORY_SNAPSHOT_CAPTURED',
    jsonb_build_object(
      'historyCaptureMode', capture_mode,
      'sourceHistoryAudiogramId', source_history_id,
      'copiedServerSide', capture_mode = 'UNCHANGED_FROM_PRIOR'
    )
  );

  return target_id;
end;
$$;

-- 20260814000000_phase10_company_employment_transfers.sql

-- Phase 10: organization master data, hospital-patient employment transitions,
-- organization-bound paperless input, and authorized cross-employment history.

create unique index organizations_normalized_thai_name_unique
  on public.organizations (
    lower(regexp_replace(btrim(name_th), '[[:space:]]+', ' ', 'g'))
  )
  where name_th is not null;
create table public.hospital_patient_employment_transitions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  from_employee_id uuid not null references public.employees(id) on delete restrict,
  to_employee_id uuid not null references public.employees(id) on delete restrict,
  from_organization_id uuid not null references public.organizations(id) on delete restrict,
  to_organization_id uuid not null references public.organizations(id) on delete restrict,
  transition_mode text not null,
  effective_date date not null,
  status text not null,
  initiated_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hospital_employment_transition_target_unique unique (to_employee_id),
  constraint hospital_employment_transition_mode_valid check (
    transition_mode in ('TRANSFER', 'CONCURRENT')
  ),
  constraint hospital_employment_transition_status_valid check (
    status in ('COMPLETED', 'PENDING_ADMIN_REVIEW')
  ),
  constraint hospital_employment_transition_organizations_differ check (
    from_organization_id <> to_organization_id
  ),
  constraint hospital_employment_transition_employees_differ check (
    from_employee_id <> to_employee_id
  ),
  constraint hospital_employment_transition_completion_consistent check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status = 'PENDING_ADMIN_REVIEW' and completed_at is null and completed_by is null)
  ),
  constraint hospital_employment_transition_from_scope
    foreign key (from_employee_id, from_organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint hospital_employment_transition_to_scope
    foreign key (to_employee_id, to_organization_id)
    references public.employees(id, organization_id) on delete restrict
);
create trigger hospital_patient_employment_transitions_set_updated_at
before update on public.hospital_patient_employment_transitions
for each row execute function public.set_updated_at();
alter table public.hospital_patient_employment_transitions enable row level security;
create policy hospital_employment_transition_clinical_read
on public.hospital_patient_employment_transitions for select to public
using (
  public.is_hospital_clinical_user()
  and (
    public.can_access_organization(from_organization_id)
    or public.can_access_organization(to_organization_id)
  )
);
alter table public.audiogram_pretest_assessments
  drop constraint audiogram_pretest_history_source_same_person;
alter table public.audiogram_pretest_assessments
  add constraint audiogram_pretest_history_source_record
  foreign key (source_history_audiogram_id)
  references public.audiograms(id) on delete restrict;
create or replace view public.hospital_employee_directory
with (security_invoker = true)
as
select
  employee.id,
  employee.organization_id,
  employee.department_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  employee.sex,
  employee.date_of_birth,
  employee.job_title,
  employee.employment_start_date,
  employee.active,
  patient.hospital_number,
  organization.name as organization_name,
  department.name as department_name,
  employee.patient_id,
  employee.employment_end_date,
  organization.name_th as organization_name_th
from public.employees employee
join public.hospital_patients patient on patient.id = employee.patient_id
join public.organizations organization on organization.id = employee.organization_id
left join public.departments department on department.id = employee.department_id;
create or replace function public.register_hospital_organization(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_name_th text := regexp_replace(btrim(p_payload ->> 'nameTh'), '[[:space:]]+', ' ', 'g');
  normalized_name text := nullif(regexp_replace(btrim(p_payload ->> 'name'), '[[:space:]]+', ' ', 'g'), '');
  generated_code text;
  organization_record public.organizations%rowtype;
begin
  if not public.is_hospital_admin() then
    raise exception 'Only a hospital administrator can create an organization' using errcode = '42501';
  end if;
  if nullif(normalized_name_th, '') is null then
    raise exception 'Thai organization name is required' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organizations organization
    where organization.name_th is not null
      and lower(regexp_replace(btrim(organization.name_th), '[[:space:]]+', ' ', 'g')) = lower(normalized_name_th)
  ) then
    raise exception 'An organization with this Thai name already exists' using errcode = '23505';
  end if;

  loop
    generated_code := 'ORG_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.organizations where code = generated_code);
  end loop;

  insert into public.organizations (code, name, name_th, active)
  values (generated_code, coalesce(normalized_name, normalized_name_th), normalized_name_th, true)
  returning * into organization_record;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    organization_record.id, 'organization', organization_record.id,
    'ORGANIZATION_CREATED',
    jsonb_build_object(
      'code', organization_record.code,
      'name', organization_record.name,
      'nameTh', organization_record.name_th
    )
  );

  return jsonb_build_object(
    'organizationId', organization_record.id,
    'code', organization_record.code
  );
end;
$$;
create or replace function public.lookup_hospital_patient_employments(p_hospital_number text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  patient_record public.hospital_patients%rowtype;
  visible_employments jsonb;
  total_employment_count integer;
begin
  if not public.is_hospital_clinical_user() then
    raise exception 'Hospital clinical access is required' using errcode = '42501';
  end if;
  if btrim(p_hospital_number) !~ '^[0-9]{7}$' then
    raise exception 'Hospital number must contain exactly seven digits' using errcode = '22023';
  end if;

  select * into patient_record
  from public.hospital_patients
  where hospital_number = btrim(p_hospital_number);
  if not found then return null; end if;

  select count(*) into total_employment_count
  from public.employees employee
  where employee.patient_id = patient_record.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'employeeId', employee.id,
    'organizationId', employee.organization_id,
    'organizationName', organization.name,
    'organizationNameTh', organization.name_th,
    'employeeNumber', employee.employee_number,
    'fullName', employee.first_name || ' ' || employee.last_name,
    'employmentStartDate', employee.employment_start_date,
    'employmentEndDate', employee.employment_end_date,
    'active', employee.active,
    'canManage', public.can_manage_organization(employee.organization_id)
  ) order by employee.active desc, employee.employment_start_date desc nulls last), '[]'::jsonb)
  into visible_employments
  from public.employees employee
  join public.organizations organization on organization.id = employee.organization_id
  where employee.patient_id = patient_record.id
    and public.can_access_organization(employee.organization_id);

  return jsonb_build_object(
    'patientId', patient_record.id,
    'hospitalNumber', patient_record.hospital_number,
    'employments', visible_employments,
    'hasHiddenEmployment', total_employment_count > jsonb_array_length(visible_employments)
  );
end;
$$;
create or replace function public.register_hospital_employee(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_organization_id uuid := (p_payload ->> 'organizationId')::uuid;
  target_department_id uuid := nullif(p_payload ->> 'departmentId', '')::uuid;
  normalized_hn text := btrim(p_payload ->> 'hospitalNumber');
  transition_mode_value text := nullif(p_payload ->> 'transitionMode', '');
  effective_date_value date := nullif(p_payload ->> 'effectiveDate', '')::date;
  requested_prior_employee_id uuid := nullif(p_payload ->> 'priorEmployeeId', '')::uuid;
  patient_record public.hospital_patients%rowtype;
  employee_record public.employees%rowtype;
  prior_employee public.employees%rowtype;
  transition_status text;
  transition_id uuid;
begin
  if not public.can_register_hospital_patient()
    or not public.can_manage_organization(target_organization_id)
  then
    raise exception 'Not authorized to register this hospital employee' using errcode = '42501';
  end if;
  if normalized_hn !~ '^[0-9]{7}$' then
    raise exception 'Hospital number must contain exactly seven digits' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload ->> 'employeeNumber'), '') is null
    or nullif(btrim(p_payload ->> 'firstName'), '') is null
    or nullif(btrim(p_payload ->> 'lastName'), '') is null
  then
    raise exception 'Employee number, first name, and last name are required' using errcode = '22023';
  end if;
  if target_department_id is not null and not exists (
    select 1 from public.departments department
    where department.id = target_department_id
      and department.organization_id = target_organization_id
  ) then
    raise exception 'Department is outside the selected organization' using errcode = '23514';
  end if;

  insert into public.hospital_patients (hospital_number)
  values (normalized_hn)
  on conflict (hospital_number) do update set hospital_number = excluded.hospital_number
  returning * into patient_record;

  select * into employee_record
  from public.employees employee
  where employee.organization_id = target_organization_id
    and employee.patient_id = patient_record.id
  for update;

  if found then
    if not employee_record.active then
      update public.employees
      set active = true,
          employment_start_date = coalesce(effective_date_value, employment_start_date),
          employment_end_date = null,
          department_id = coalesce(target_department_id, department_id),
          employee_number = btrim(p_payload ->> 'employeeNumber')
      where id = employee_record.id
      returning * into employee_record;
      insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
      values (target_organization_id, 'employee', employee_record.id, 'EMPLOYMENT_REACTIVATED',
        jsonb_build_object('patientId', patient_record.id, 'effectiveDate', effective_date_value));
    end if;
    return jsonb_build_object(
      'employeeId', employee_record.id,
      'patientId', patient_record.id,
      'hospitalNumber', patient_record.hospital_number,
      'created', false,
      'transitionStatus', null
    );
  end if;

  if requested_prior_employee_id is not null then
    select * into prior_employee
    from public.employees employee
    where employee.id = requested_prior_employee_id
      and employee.patient_id = patient_record.id
      and employee.organization_id <> target_organization_id
    for update;
    if not found then
      raise exception 'Prior employment does not belong to this HN or is already in the selected organization' using errcode = '23514';
    end if;
  else
    select * into prior_employee
    from public.employees employee
    where employee.patient_id = patient_record.id
      and employee.organization_id <> target_organization_id
    order by employee.active desc, employee.employment_start_date desc nulls last, employee.created_at desc
    limit 1
    for update;
  end if;

  if prior_employee.id is not null then
    if transition_mode_value not in ('TRANSFER', 'CONCURRENT') or effective_date_value is null then
      raise exception 'Existing HN in another organization requires transfer/concurrent mode and an effective date' using errcode = '23514';
    end if;
  elsif transition_mode_value is not null or requested_prior_employee_id is not null then
    raise exception 'Employment transition was supplied but no prior employment exists' using errcode = '23514';
  end if;

  insert into public.employees (
    organization_id, department_id, patient_id, employee_number,
    first_name, last_name, sex, date_of_birth, job_title,
    employment_start_date, active
  ) values (
    target_organization_id, target_department_id, patient_record.id,
    btrim(p_payload ->> 'employeeNumber'), btrim(p_payload ->> 'firstName'),
    btrim(p_payload ->> 'lastName'), nullif(p_payload ->> 'sex', ''),
    nullif(p_payload ->> 'dateOfBirth', '')::date,
    nullif(btrim(p_payload ->> 'jobTitle'), ''),
    coalesce(effective_date_value, nullif(p_payload ->> 'employmentStartDate', '')::date),
    true
  ) returning * into employee_record;

  if prior_employee.id is not null then
    if transition_mode_value = 'CONCURRENT' then
      transition_status := 'COMPLETED';
    elsif public.can_manage_organization(prior_employee.organization_id) then
      update public.employees
      set employment_end_date = effective_date_value - 1,
          active = false
      where id = prior_employee.id;
      transition_status := 'COMPLETED';
      insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
      values (prior_employee.organization_id, 'employee', prior_employee.id, 'EMPLOYMENT_ENDED_BY_TRANSFER',
        jsonb_build_object('toEmployeeId', employee_record.id, 'effectiveDate', effective_date_value));
    else
      transition_status := 'PENDING_ADMIN_REVIEW';
    end if;

    insert into public.hospital_patient_employment_transitions (
      patient_id, from_employee_id, to_employee_id,
      from_organization_id, to_organization_id, transition_mode,
      effective_date, status, initiated_by, completed_by, completed_at
    ) values (
      patient_record.id, prior_employee.id, employee_record.id,
      prior_employee.organization_id, target_organization_id, transition_mode_value,
      effective_date_value, transition_status, auth.uid(),
      case when transition_status = 'COMPLETED' then auth.uid() else null end,
      case when transition_status = 'COMPLETED' then timezone('utc', now()) else null end
    ) returning id into transition_id;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_organization_id, 'employee', employee_record.id, 'HOSPITAL_EMPLOYEE_REGISTERED',
    jsonb_build_object(
      'patientId', patient_record.id,
      'hospitalNumberRegistered', true,
      'employeeNumber', employee_record.employee_number,
      'transitionId', transition_id,
      'transitionMode', transition_mode_value,
      'transitionStatus', transition_status
    )
  );

  return jsonb_build_object(
    'employeeId', employee_record.id,
    'patientId', patient_record.id,
    'hospitalNumber', patient_record.hospital_number,
    'created', true,
    'transitionId', transition_id,
    'transitionStatus', transition_status
  );
end;
$$;
create or replace function public.complete_employment_transfer(p_transition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  transition_record public.hospital_patient_employment_transitions%rowtype;
begin
  if not public.is_hospital_admin() then
    raise exception 'Only a hospital administrator can complete a pending transfer' using errcode = '42501';
  end if;
  select * into transition_record
  from public.hospital_patient_employment_transitions
  where id = p_transition_id
  for update;
  if not found or transition_record.status <> 'PENDING_ADMIN_REVIEW'
    or transition_record.transition_mode <> 'TRANSFER'
  then
    raise exception 'Pending transfer was not found' using errcode = '23514';
  end if;

  update public.employees
  set employment_end_date = transition_record.effective_date - 1,
      active = false
  where id = transition_record.from_employee_id;

  update public.hospital_patient_employment_transitions
  set status = 'COMPLETED', completed_by = auth.uid(), completed_at = timezone('utc', now())
  where id = transition_record.id;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (transition_record.from_organization_id, 'employee', transition_record.from_employee_id,
    'EMPLOYMENT_TRANSFER_APPROVED',
    jsonb_build_object('transitionId', transition_record.id, 'toEmployeeId', transition_record.to_employee_id));

  return jsonb_build_object('transitionId', transition_record.id, 'status', 'COMPLETED');
end;
$$;
create or replace function public.save_paperless_audiogram_draft(
  p_audiogram_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_id uuid;
  target_employee public.employees%rowtype;
  target_record public.audiograms%rowtype;
  source_record public.audiograms%rowtype;
  source_employee public.employees%rowtype;
  capture_mode text := coalesce(nullif(p_payload #>> '{pretest,historyCaptureMode}', ''), 'LEGACY_FULL');
  source_history_id uuid := nullif(p_payload #>> '{pretest,sourceHistoryAudiogramId}', '')::uuid;
  payload_organization_id uuid := nullif(p_payload ->> 'organizationId', '')::uuid;
  source_history_count integer;
begin
  select * into target_employee from public.employees where id = (p_payload ->> 'employeeId')::uuid;
  if not found or payload_organization_id is null
    or target_employee.organization_id <> payload_organization_id
    or not public.can_manage_organization(payload_organization_id)
  then
    raise exception 'Paperless organization must match the employee and actor scope' using errcode = '42501';
  end if;
  if capture_mode not in ('QUICK_SCREEN', 'UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR', 'LEGACY_FULL') then
    raise exception 'Invalid history capture mode' using errcode = '22023';
  end if;
  if capture_mode in ('QUICK_SCREEN', 'LEGACY_FULL') and source_history_id is not null then
    raise exception 'A new history screen cannot reference a prior history record' using errcode = '23514';
  end if;
  if capture_mode in ('UNCHANGED_FROM_PRIOR', 'UPDATED_FROM_PRIOR') and source_history_id is null then
    raise exception 'Prior-history capture requires a source Final record' using errcode = '23514';
  end if;

  target_id := public.save_paperless_audiogram_draft_legacy(p_audiogram_id, p_payload);
  select * into target_record from public.audiograms where id = target_id;

  if source_history_id is not null then
    select * into source_record from public.audiograms where id = source_history_id;
    select * into source_employee from public.employees where id = source_record.employee_id;
    if source_record.id is null
      or source_record.id = target_record.id
      or source_record.record_status <> 'FINAL'
      or source_record.examined_at > target_record.examined_at
      or source_employee.patient_id is null
      or source_employee.patient_id <> target_employee.patient_id
      or not public.can_access_organization(source_record.organization_id)
      or (target_record.exam_type in ('REPEAT', 'CONFIRMATION')
        and (source_record.employee_id <> target_record.employee_id
          or source_record.organization_id <> target_record.organization_id))
    then
      raise exception 'Prior history source must be an authorized earlier Final record for the same HN'
        using errcode = '23514';
    end if;
    if not exists (select 1 from public.audiogram_pretest_assessments where audiogram_id = source_history_id) then
      raise exception 'Prior history source has no completed assessment' using errcode = '23514';
    end if;
    select count(*) into source_history_count from public.audiogram_history_responses where audiogram_id = source_history_id;
    if source_history_count <> 21 then
      raise exception 'Prior history source does not contain a complete 21-response snapshot' using errcode = '23514';
    end if;
  end if;

  update public.audiogram_pretest_assessments
  set history_capture_mode = capture_mode,
      source_history_audiogram_id = source_history_id,
      history_verified_by = case when capture_mode = 'LEGACY_FULL' then null else auth.uid() end,
      history_verified_at = case when capture_mode = 'LEGACY_FULL' then null else timezone('utc', now()) end
  where audiogram_id = target_id;

  if capture_mode = 'UNCHANGED_FROM_PRIOR' then
    delete from public.audiogram_history_responses where audiogram_id = target_id;
    insert into public.audiogram_history_responses (audiogram_id, question_code, answer, ear_scope, details)
    select target_id, question_code, answer, ear_scope, details
    from public.audiogram_history_responses where audiogram_id = source_history_id;
  end if;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (target_record.organization_id, 'audiogram', target_id, 'PAPERLESS_HISTORY_SNAPSHOT_CAPTURED',
    jsonb_build_object('historyCaptureMode', capture_mode, 'sourceHistoryAudiogramId', source_history_id,
      'copiedServerSide', capture_mode = 'UNCHANGED_FROM_PRIOR'));
  return target_id;
end;
$$;
comment on table public.hospital_patient_employment_transitions is
  'Auditable transfer/concurrent-employment link between organization-scoped employee records for one HN.';

-- 20260815000000_phase11_fast_entry_important_history_equipment.sql

-- Phase 11: fast paperless entry, hospital audiometer/examiner master data,
-- patient-level important hearing history, and immutable per-exam snapshots.

create table public.hospital_audiometers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  model text not null,
  serial_number text not null unique,
  location text not null,
  calibration_date date,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hospital_audiometers_display_name_not_blank check (nullif(btrim(display_name), '') is not null),
  constraint hospital_audiometers_model_not_blank check (nullif(btrim(model), '') is not null),
  constraint hospital_audiometers_serial_not_blank check (nullif(btrim(serial_number), '') is not null),
  constraint hospital_audiometers_location_not_blank check (nullif(btrim(location), '') is not null)
);
create trigger hospital_audiometers_set_updated_at
before update on public.hospital_audiometers
for each row execute function public.set_updated_at();
create table public.hospital_patient_hearing_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  category text not null,
  ear_scope text not null,
  onset text not null,
  information_source text not null,
  details text,
  status text not null default 'ACTIVE',
  status_reason text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default timezone('utc', now()),
  status_changed_by uuid references auth.users(id) on delete set null,
  status_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hospital_hearing_condition_category_valid check (category in (
    'PRE_EXISTING_HEARING_LOSS',
    'PRE_EXISTING_HEARING_DISABILITY',
    'OTHER_IMPORTANT_HEARING_HISTORY'
  )),
  constraint hospital_hearing_condition_ear_valid check (ear_scope in ('LEFT', 'RIGHT', 'BOTH', 'UNKNOWN')),
  constraint hospital_hearing_condition_onset_valid check (onset in ('CONGENITAL_OR_CHILDHOOD', 'LATER', 'UNKNOWN')),
  constraint hospital_hearing_condition_source_valid check (information_source in (
    'PATIENT_OR_FAMILY', 'PRIOR_MEDICAL_RECORD', 'PHYSICIAN_CONFIRMED'
  )),
  constraint hospital_hearing_condition_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ENTERED_IN_ERROR')),
  constraint hospital_hearing_condition_status_consistent check (
    status = 'ACTIVE'
    or (nullif(btrim(status_reason), '') is not null and status_changed_at is not null)
  )
);
create unique index hospital_patient_one_active_hearing_condition_category
  on public.hospital_patient_hearing_conditions (patient_id, category)
  where status = 'ACTIVE';
create index hospital_patient_hearing_conditions_patient_idx
  on public.hospital_patient_hearing_conditions (patient_id, status, updated_at desc);
create trigger hospital_patient_hearing_conditions_set_updated_at
before update on public.hospital_patient_hearing_conditions
for each row execute function public.set_updated_at();
create table public.audiogram_hearing_condition_snapshots (
  id uuid primary key default gen_random_uuid(),
  audiogram_id uuid not null references public.audiograms(id) on delete cascade,
  source_condition_id uuid references public.hospital_patient_hearing_conditions(id) on delete restrict,
  category text not null,
  ear_scope text not null,
  onset text not null,
  information_source text not null,
  details text,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default timezone('utc', now()),
  constraint audiogram_hearing_snapshot_category_valid check (category in (
    'PRE_EXISTING_HEARING_LOSS',
    'PRE_EXISTING_HEARING_DISABILITY',
    'OTHER_IMPORTANT_HEARING_HISTORY'
  )),
  constraint audiogram_hearing_snapshot_ear_valid check (ear_scope in ('LEFT', 'RIGHT', 'BOTH', 'UNKNOWN')),
  constraint audiogram_hearing_snapshot_onset_valid check (onset in ('CONGENITAL_OR_CHILDHOOD', 'LATER', 'UNKNOWN')),
  constraint audiogram_hearing_snapshot_source_valid check (information_source in (
    'PATIENT_OR_FAMILY', 'PRIOR_MEDICAL_RECORD', 'PHYSICIAN_CONFIRMED'
  ))
);
create unique index audiogram_hearing_snapshot_category_unique
  on public.audiogram_hearing_condition_snapshots (audiogram_id, category);
alter table public.audiogram_pretest_assessments
  add column important_history_capture_mode text not null default 'LEGACY_NONE',
  add column important_history_source_audiogram_id uuid references public.audiograms(id) on delete restrict,
  add column important_history_verified_by uuid references auth.users(id) on delete set null,
  add column important_history_verified_at timestamptz,
  add column important_history_snapshot_present boolean not null default false,
  add constraint audiogram_important_history_capture_mode_valid check (
    important_history_capture_mode in ('CONFIRMED_CURRENT', 'UPDATED_CURRENT', 'COPY_SOURCE', 'LEGACY_NONE')
  ),
  add constraint audiogram_important_history_source_consistent check (
    (important_history_capture_mode = 'COPY_SOURCE' and important_history_source_audiogram_id is not null)
    or (important_history_capture_mode <> 'COPY_SOURCE' and important_history_source_audiogram_id is null)
  );
alter table public.audiograms
  add column audiometer_id uuid references public.hospital_audiometers(id) on delete restrict,
  add column examiner_user_id uuid references auth.users(id) on delete restrict,
  add column equipment_calibration_status text,
  add column equipment_calibration_acknowledged boolean not null default false,
  add constraint audiograms_equipment_calibration_status_valid check (
    equipment_calibration_status is null
    or equipment_calibration_status in ('CURRENT', 'OVERDUE', 'UNKNOWN')
  );
alter table public.hospital_audiometers enable row level security;
alter table public.hospital_patient_hearing_conditions enable row level security;
alter table public.audiogram_hearing_condition_snapshots enable row level security;
create policy hospital_audiometers_clinical_read
on public.hospital_audiometers for select to public
using (public.is_hospital_clinical_user());
create policy hospital_hearing_conditions_clinical_read
on public.hospital_patient_hearing_conditions for select to public
using (
  public.is_hospital_clinical_user()
  and exists (
    select 1 from public.employees employee
    where employee.patient_id = hospital_patient_hearing_conditions.patient_id
      and public.can_access_organization(employee.organization_id)
  )
);
create policy audiogram_hearing_snapshots_clinical_read
on public.audiogram_hearing_condition_snapshots for select to public
using (
  public.is_hospital_clinical_user()
  and exists (
    select 1 from public.audiograms audiogram
    where audiogram.id = audiogram_hearing_condition_snapshots.audiogram_id
      and public.can_access_organization(audiogram.organization_id)
  )
);
create or replace function public.paperless_examiner_options()
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(jsonb_agg(candidate order by candidate ->> 'fullName'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', auth_user.id,
      'fullName', coalesce(nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), auth_user.email),
      'email', auth_user.email,
      'organizationIds', coalesce((
        select jsonb_agg(access.organization_id)
        from public.user_organization_access access
        where access.user_id = auth_user.id
          and access.active
          and access.role = 'OCCUPATIONAL_HEALTH_STAFF'
          and access.organization_id is not null
      ), '[]'::jsonb),
      'global', exists (
        select 1 from public.user_organization_access access
        where access.user_id = auth_user.id
          and access.active
          and access.role = 'HOSPITAL_ADMIN'
      )
    ) as candidate
    from auth.users auth_user
    where public.is_hospital_clinical_user()
      and exists (
        select 1 from public.user_organization_access candidate_access
        where candidate_access.user_id = auth_user.id
          and candidate_access.active
          and candidate_access.role in ('HOSPITAL_ADMIN', 'OCCUPATIONAL_HEALTH_STAFF')
          and (
            public.is_hospital_admin()
            or candidate_access.role = 'HOSPITAL_ADMIN'
            or public.can_access_organization(candidate_access.organization_id)
          )
      )
  ) options;
$$;
create or replace function public.upsert_hospital_audiometer(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  saved public.hospital_audiometers%rowtype;
begin
  if not public.is_hospital_admin() then
    raise exception 'Only Hospital Admin can manage audiometers' using errcode = '42501';
  end if;
  if target_id is null then
    insert into public.hospital_audiometers (
      display_name, model, serial_number, location, calibration_date, active, created_by
    ) values (
      btrim(p_payload ->> 'displayName'), btrim(p_payload ->> 'model'),
      btrim(p_payload ->> 'serialNumber'), btrim(p_payload ->> 'location'),
      nullif(p_payload ->> 'calibrationDate', '')::date,
      coalesce((p_payload ->> 'active')::boolean, true), auth.uid()
    ) returning * into saved;
  else
    update public.hospital_audiometers
    set display_name = btrim(p_payload ->> 'displayName'),
        model = btrim(p_payload ->> 'model'),
        serial_number = btrim(p_payload ->> 'serialNumber'),
        location = btrim(p_payload ->> 'location'),
        calibration_date = nullif(p_payload ->> 'calibrationDate', '')::date,
        active = coalesce((p_payload ->> 'active')::boolean, true)
    where id = target_id
    returning * into saved;
    if saved.id is null then
      raise exception 'Audiometer not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  )
  select organization.id, 'hospital_audiometer', saved.id, 'HOSPITAL_AUDIOMETER_UPSERTED',
    jsonb_build_object(
      'displayName', saved.display_name,
      'model', saved.model,
      'serialNumber', saved.serial_number,
      'location', saved.location,
      'calibrationDate', saved.calibration_date,
      'active', saved.active
    )
  from public.organizations organization
  where public.can_access_organization(organization.id)
  order by organization.created_at
  limit 1;
  return saved.id;
end;
$$;
alter function public.save_paperless_audiogram_draft(uuid, jsonb)
  rename to save_paperless_audiogram_draft_phase10;
create or replace function public.save_paperless_audiogram_draft(
  p_audiogram_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_id uuid;
  target_record public.audiograms%rowtype;
  target_employee public.employees%rowtype;
  source_correction public.audiograms%rowtype;
  equipment public.hospital_audiometers%rowtype;
  examiner auth.users%rowtype;
  selected_audiometer_id uuid := nullif(p_payload ->> 'audiometerId', '')::uuid;
  selected_examiner_id uuid := coalesce(nullif(p_payload ->> 'examinerUserId', '')::uuid, auth.uid());
  supersedes_id uuid := nullif(p_payload ->> 'supersedesAudiogramId', '')::uuid;
  important_mode text := coalesce(nullif(p_payload #>> '{importantHistory,captureMode}', ''), 'LEGACY_NONE');
  important_source_id uuid := nullif(p_payload #>> '{importantHistory,sourceAudiogramId}', '')::uuid;
  important_item jsonb;
  important_condition public.hospital_patient_hearing_conditions%rowtype;
  existing_snapshot_present boolean := false;
  calibration_state text;
  legacy_equipment_payload boolean := p_payload ? 'audiometerModel' and not (p_payload ? 'audiometerId');
begin
  select * into target_employee
  from public.employees
  where id = (p_payload ->> 'employeeId')::uuid;
  if target_employee.id is null or target_employee.patient_id is null
    or target_employee.organization_id <> (p_payload ->> 'organizationId')::uuid
    or not public.can_manage_organization(target_employee.organization_id)
  then
    raise exception 'Paperless employee, HN, organization, or actor scope is invalid' using errcode = '42501';
  end if;

  if important_mode not in ('CONFIRMED_CURRENT', 'UPDATED_CURRENT', 'COPY_SOURCE', 'LEGACY_NONE') then
    raise exception 'Invalid important hearing history capture mode' using errcode = '22023';
  end if;
  if important_mode = 'COPY_SOURCE' and important_source_id is null then
    raise exception 'Correction history requires its source audiogram' using errcode = '23514';
  end if;
  if important_mode <> 'COPY_SOURCE' and important_source_id is not null then
    raise exception 'Only correction history may reference an important-history source' using errcode = '23514';
  end if;

  if supersedes_id is not null then
    select * into source_correction from public.audiograms where id = supersedes_id;
  end if;
  if selected_audiometer_id is null and source_correction.audiometer_id is not null then
    selected_audiometer_id := source_correction.audiometer_id;
  end if;
  if selected_audiometer_id is null and source_correction.id is null then
    select id into selected_audiometer_id
    from public.hospital_audiometers
    where active
    order by display_name, id
    limit 1;
  end if;
  if selected_audiometer_id is not null then
    select * into equipment
    from public.hospital_audiometers
    where id = selected_audiometer_id
      and (active or id = source_correction.audiometer_id);
    if equipment.id is null then
      raise exception 'Selected audiometer is unavailable' using errcode = '23514';
    end if;
  elsif source_correction.id is null then
    raise exception 'An active hospital audiometer is required' using errcode = '23514';
  end if;

  select * into examiner from auth.users where id = selected_examiner_id;
  if examiner.id is null or not exists (
    select 1 from public.user_organization_access access
    where access.user_id = examiner.id
      and access.active
      and (
        access.role = 'HOSPITAL_ADMIN'
        or (access.role = 'OCCUPATIONAL_HEALTH_STAFF'
          and access.organization_id = target_employee.organization_id)
      )
  ) then
    raise exception 'Examiner must be an active authorized Hospital Admin or OH staff member'
      using errcode = '42501';
  end if;

  target_id := public.save_paperless_audiogram_draft_phase10(p_audiogram_id, p_payload);
  select * into target_record from public.audiograms where id = target_id for update;
  select assessment.important_history_snapshot_present
  into existing_snapshot_present
  from public.audiogram_pretest_assessments assessment
  where assessment.audiogram_id = target_id;

  if equipment.id is not null then
    calibration_state := case
      when equipment.calibration_date is null then 'UNKNOWN'
      when equipment.calibration_date > target_record.exam_date then 'UNKNOWN'
      when equipment.calibration_date + interval '1 year' < target_record.exam_date then 'OVERDUE'
      else 'CURRENT'
    end;
    update public.audiograms
    set audiometer_id = equipment.id,
        examiner_user_id = examiner.id,
        audiometer_model = equipment.model,
        audiometer_serial = equipment.serial_number,
        calibration_date = equipment.calibration_date,
        examiner = coalesce(nullif(btrim(examiner.raw_user_meta_data ->> 'full_name'), ''), examiner.email),
        location = equipment.location,
        equipment_calibration_status = calibration_state,
        equipment_calibration_acknowledged = coalesce(
          (p_payload ->> 'equipmentCalibrationAcknowledged')::boolean,
          legacy_equipment_payload
        )
    where id = target_id;
  else
    update public.audiograms
    set audiometer_id = null,
        examiner_user_id = examiner.id,
        audiometer_model = source_correction.audiometer_model,
        audiometer_serial = source_correction.audiometer_serial,
        calibration_date = source_correction.calibration_date,
        examiner = coalesce(nullif(btrim(examiner.raw_user_meta_data ->> 'full_name'), ''), examiner.email),
        location = source_correction.location,
        equipment_calibration_status = coalesce(source_correction.equipment_calibration_status, 'UNKNOWN'),
        equipment_calibration_acknowledged = coalesce(
          (p_payload ->> 'equipmentCalibrationAcknowledged')::boolean,
          true
        )
    where id = target_id;
  end if;

  if important_mode = 'UPDATED_CURRENT' then
    for important_item in
      select * from jsonb_array_elements(coalesce(p_payload #> '{importantHistory,conditions}', '[]'::jsonb))
    loop
      if important_item ->> 'source' = 'PHYSICIAN_CONFIRMED'
        and not public.can_review_baseline(target_employee.organization_id)
      then
        raise exception 'Only an occupational physician may set Physician confirmed'
          using errcode = '42501';
      end if;

      if nullif(important_item ->> 'id', '') is not null then
        select * into important_condition
        from public.hospital_patient_hearing_conditions
        where id = (important_item ->> 'id')::uuid
          and patient_id = target_employee.patient_id
        for update;
        if important_condition.id is null then
          raise exception 'Important hearing condition is outside this HN' using errcode = '42501';
        end if;
        update public.hospital_patient_hearing_conditions
        set category = important_item ->> 'category',
            ear_scope = important_item ->> 'earScope',
            onset = important_item ->> 'onset',
            information_source = important_item ->> 'source',
            details = nullif(btrim(important_item ->> 'details'), ''),
            status = important_item ->> 'status',
            status_reason = case when important_item ->> 'status' = 'ACTIVE' then null
              else nullif(btrim(important_item ->> 'statusReason'), '') end,
            status_changed_by = case when important_item ->> 'status' = 'ACTIVE' then null else auth.uid() end,
            status_changed_at = case when important_item ->> 'status' = 'ACTIVE' then null else timezone('utc', now()) end
        where id = important_condition.id;
      elsif important_item ->> 'status' = 'ACTIVE' then
        select * into important_condition
        from public.hospital_patient_hearing_conditions
        where patient_id = target_employee.patient_id
          and category = important_item ->> 'category'
          and status = 'ACTIVE'
        for update;
        if important_condition.id is null then
          insert into public.hospital_patient_hearing_conditions (
            patient_id, category, ear_scope, onset, information_source, details, status, recorded_by
          ) values (
            target_employee.patient_id, important_item ->> 'category', important_item ->> 'earScope',
            important_item ->> 'onset', important_item ->> 'source',
            nullif(btrim(important_item ->> 'details'), ''), 'ACTIVE', auth.uid()
          );
        else
          update public.hospital_patient_hearing_conditions
          set ear_scope = important_item ->> 'earScope',
              onset = important_item ->> 'onset',
              information_source = important_item ->> 'source',
              details = nullif(btrim(important_item ->> 'details'), '')
          where id = important_condition.id;
        end if;
      end if;
    end loop;

    update public.hospital_patient_hearing_conditions condition
    set status = 'INACTIVE',
        status_reason = 'ยืนยันว่าไม่มีรายการนี้แล้วระหว่างการอัปเดตประวัติการได้ยิน',
        status_changed_by = auth.uid(),
        status_changed_at = timezone('utc', now())
    where condition.patient_id = target_employee.patient_id
      and condition.status = 'ACTIVE'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_payload #> '{importantHistory,conditions}', '[]'::jsonb)) item
        where item ->> 'category' = condition.category
          and item ->> 'status' = 'ACTIVE'
      );

    delete from public.audiogram_hearing_condition_snapshots where audiogram_id = target_id;
    insert into public.audiogram_hearing_condition_snapshots (
      audiogram_id, source_condition_id, category, ear_scope, onset,
      information_source, details, captured_by
    )
    select target_id, condition.id, condition.category, condition.ear_scope, condition.onset,
      condition.information_source, condition.details, auth.uid()
    from public.hospital_patient_hearing_conditions condition
    where condition.patient_id = target_employee.patient_id and condition.status = 'ACTIVE';
    existing_snapshot_present := true;
  elsif important_mode = 'CONFIRMED_CURRENT' and not existing_snapshot_present then
    insert into public.audiogram_hearing_condition_snapshots (
      audiogram_id, source_condition_id, category, ear_scope, onset,
      information_source, details, captured_by
    )
    select target_id, condition.id, condition.category, condition.ear_scope, condition.onset,
      condition.information_source, condition.details, auth.uid()
    from public.hospital_patient_hearing_conditions condition
    where condition.patient_id = target_employee.patient_id and condition.status = 'ACTIVE';
    existing_snapshot_present := true;
  elsif important_mode = 'COPY_SOURCE' then
    if not exists (
      select 1 from public.audiograms source
      join public.employees source_employee on source_employee.id = source.employee_id
      join public.audiogram_pretest_assessments assessment on assessment.audiogram_id = source.id
      where source.id = important_source_id
        and source.record_status = 'FINAL'
        and source_employee.patient_id = target_employee.patient_id
        and public.can_access_organization(source.organization_id)
    ) then
      raise exception 'Important-history correction source is not an authorized Final record for this HN'
        using errcode = '23514';
    end if;
    delete from public.audiogram_hearing_condition_snapshots where audiogram_id = target_id;
    insert into public.audiogram_hearing_condition_snapshots (
      audiogram_id, source_condition_id, category, ear_scope, onset,
      information_source, details, captured_by
    )
    select target_id, snapshot.source_condition_id, snapshot.category, snapshot.ear_scope,
      snapshot.onset, snapshot.information_source, snapshot.details, auth.uid()
    from public.audiogram_hearing_condition_snapshots snapshot
    where snapshot.audiogram_id = important_source_id;
    select assessment.important_history_snapshot_present into existing_snapshot_present
    from public.audiogram_pretest_assessments assessment
    where assessment.audiogram_id = important_source_id;
  end if;

  update public.audiogram_pretest_assessments
  set important_history_capture_mode = important_mode,
      important_history_source_audiogram_id = important_source_id,
      important_history_verified_by = case when important_mode = 'LEGACY_NONE' then null else auth.uid() end,
      important_history_verified_at = case when important_mode = 'LEGACY_NONE' then null else timezone('utc', now()) end,
      important_history_snapshot_present = coalesce(existing_snapshot_present, false)
  where audiogram_id = target_id;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_employee.organization_id, 'audiogram', target_id,
    'IMPORTANT_HEARING_HISTORY_SNAPSHOT_CAPTURED',
    jsonb_build_object(
      'captureMode', important_mode,
      'sourceAudiogramId', important_source_id,
      'snapshotPresent', coalesce(existing_snapshot_present, false),
      'activeConditionCount', (
        select count(*) from public.audiogram_hearing_condition_snapshots where audiogram_id = target_id
      ),
      'affectsClinicalRules', false
    )
  );
  return target_id;
end;
$$;
alter function public.finalize_paperless_audiogram(uuid, jsonb, jsonb)
  rename to finalize_paperless_audiogram_phase9;
create or replace function public.finalize_paperless_audiogram(
  p_audiogram_id uuid,
  p_thai_evaluation jsonb,
  p_osha_evaluation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  draft_record public.audiograms%rowtype;
  original_calibration_date date;
  result jsonb;
begin
  select * into draft_record from public.audiograms where id = p_audiogram_id for update;
  if draft_record.id is null or draft_record.record_status <> 'DRAFT'
    or not public.can_manage_organization(draft_record.organization_id)
  then
    raise exception 'Only an authorized Draft may be finalized' using errcode = '42501';
  end if;
  if draft_record.audiometer_model is null or draft_record.audiometer_serial is null
    or draft_record.location is null or draft_record.examiner is null
    or draft_record.examiner_user_id is null
  then
    raise exception 'Final requires a server-resolved audiometer and authorized examiner'
      using errcode = '23514';
  end if;
  if draft_record.equipment_calibration_status in ('OVERDUE', 'UNKNOWN')
    and not draft_record.equipment_calibration_acknowledged
  then
    raise exception 'Calibration warning must be acknowledged before Final'
      using errcode = '23514';
  end if;

  original_calibration_date := draft_record.calibration_date;
  if draft_record.calibration_date is null or draft_record.calibration_date > draft_record.exam_date then
    update public.audiograms set calibration_date = exam_date where id = draft_record.id;
  end if;
  result := public.finalize_paperless_audiogram_phase9(
    p_audiogram_id, p_thai_evaluation, p_osha_evaluation
  );
  if original_calibration_date is null or original_calibration_date > draft_record.exam_date then
    update public.audiograms set calibration_date = original_calibration_date where id = draft_record.id;
  end if;

  if draft_record.equipment_calibration_status in ('OVERDUE', 'UNKNOWN') then
    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action, new_values_json
    ) values (
      draft_record.organization_id, 'audiogram', draft_record.id,
      'AUDIOMETER_CALIBRATION_WARNING_ACKNOWLEDGED',
      jsonb_build_object(
        'calibrationStatus', draft_record.equipment_calibration_status,
        'calibrationDate', original_calibration_date,
        'acknowledged', true
      )
    );
  end if;
  return result;
end;
$$;
alter function public.propose_initial_thai_baseline(uuid)
  rename to propose_initial_thai_baseline_phase9;
create or replace function public.propose_initial_thai_baseline(p_audiogram_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  candidate public.audiograms%rowtype;
  quiet_record public.audiogram_pretest_assessments%rowtype;
begin
  select * into candidate from public.audiograms where id = p_audiogram_id;
  if candidate.id is null or not public.can_manage_organization(candidate.organization_id) then
    raise exception 'Not authorized to propose this baseline' using errcode = '42501';
  end if;
  select * into quiet_record from public.audiogram_pretest_assessments where audiogram_id = candidate.id;
  if quiet_record.quiet_period_answer <> 'YES'
    or coalesce(quiet_record.quiet_period_hours, 0) < 14
  then
    raise exception 'Baseline proposal requires a documented quiet period of at least 14 hours'
      using errcode = '23514';
  end if;
  return public.propose_initial_thai_baseline_phase9(p_audiogram_id);
end;
$$;
comment on table public.hospital_patient_hearing_conditions is
  'Current patient-level important hearing history; status changes are retained and audited, never hard-deleted.';
comment on table public.audiogram_hearing_condition_snapshots is
  'Immutable important-hearing-history evidence captured for one paperless audiogram; it never changes surveillance rules.';
comment on table public.hospital_audiometers is
  'Hospital audiometer master. Model, serial, location, and calibration are resolved server-side into each record snapshot.';

-- 20260815010000_phase11_physician_hearing_history_governance.sql

-- Dedicated patient-history governance path. Physicians do not edit Paperless
-- drafts, but can confirm an important hearing-history item from the HN view.

create or replace function public.manage_patient_hearing_condition(
  p_employee_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  target_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  target_status text := coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE');
  target_source text := p_payload ->> 'source';
  saved public.hospital_patient_hearing_conditions%rowtype;
begin
  select * into target_employee from public.employees where id = p_employee_id;
  if target_employee.id is null or target_employee.patient_id is null
    or not public.is_hospital_clinical_user()
    or not public.can_access_organization(target_employee.organization_id)
  then
    raise exception 'Important hearing history is outside the actor scope' using errcode = '42501';
  end if;
  if not (
    public.can_manage_organization(target_employee.organization_id)
    or public.can_review_baseline(target_employee.organization_id)
  ) then
    raise exception 'Only authorized OH staff or occupational physicians may manage important hearing history'
      using errcode = '42501';
  end if;
  if target_source = 'PHYSICIAN_CONFIRMED'
    and not public.can_review_baseline(target_employee.organization_id)
  then
    raise exception 'Only an occupational physician may set Physician confirmed'
      using errcode = '42501';
  end if;
  if target_status <> 'ACTIVE' and nullif(btrim(p_payload ->> 'statusReason'), '') is null then
    raise exception 'Inactive or entered-in-error history requires a reason' using errcode = '23514';
  end if;

  if target_id is null then
    insert into public.hospital_patient_hearing_conditions (
      patient_id, category, ear_scope, onset, information_source, details,
      status, status_reason, recorded_by, status_changed_by, status_changed_at
    ) values (
      target_employee.patient_id, p_payload ->> 'category', p_payload ->> 'earScope',
      p_payload ->> 'onset', target_source, nullif(btrim(p_payload ->> 'details'), ''),
      target_status,
      case when target_status = 'ACTIVE' then null else btrim(p_payload ->> 'statusReason') end,
      auth.uid(), case when target_status = 'ACTIVE' then null else auth.uid() end,
      case when target_status = 'ACTIVE' then null else timezone('utc', now()) end
    ) returning * into saved;
  else
    update public.hospital_patient_hearing_conditions
    set category = p_payload ->> 'category',
        ear_scope = p_payload ->> 'earScope',
        onset = p_payload ->> 'onset',
        information_source = target_source,
        details = nullif(btrim(p_payload ->> 'details'), ''),
        status = target_status,
        status_reason = case when target_status = 'ACTIVE' then null else btrim(p_payload ->> 'statusReason') end,
        status_changed_by = case when target_status = 'ACTIVE' then null else auth.uid() end,
        status_changed_at = case when target_status = 'ACTIVE' then null else timezone('utc', now()) end
    where id = target_id and patient_id = target_employee.patient_id
    returning * into saved;
    if saved.id is null then
      raise exception 'Important hearing condition not found for this HN' using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_employee.organization_id, 'hospital_patient_hearing_condition', saved.id,
    case when target_id is null then 'IMPORTANT_HEARING_CONDITION_RECORDED'
      else 'IMPORTANT_HEARING_CONDITION_STATUS_UPDATED' end,
    jsonb_build_object(
      'patientId', saved.patient_id,
      'category', saved.category,
      'earScope', saved.ear_scope,
      'onset', saved.onset,
      'source', saved.information_source,
      'status', saved.status,
      'statusReason', saved.status_reason,
      'affectsClinicalRules', false
    )
  );
  return saved.id;
end;
$$;

-- 20260815020000_phase11_hearing_history_audit_trigger.sql

create or replace function public.audit_patient_hearing_condition_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  audit_organization_id uuid;
begin
  select employee.organization_id into audit_organization_id
  from public.employees employee
  where employee.patient_id = new.patient_id
    and public.can_access_organization(employee.organization_id)
  order by employee.active desc, employee.updated_at desc
  limit 1;

  if audit_organization_id is not null then
    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action, old_values_json, new_values_json
    ) values (
      audit_organization_id,
      'hospital_patient_hearing_condition',
      new.id,
      case when tg_op = 'INSERT' then 'IMPORTANT_HEARING_CONDITION_RECORDED'
        else 'IMPORTANT_HEARING_CONDITION_UPDATED' end,
      case when tg_op = 'INSERT' then '{}'::jsonb else jsonb_build_object(
        'category', old.category,
        'earScope', old.ear_scope,
        'onset', old.onset,
        'source', old.information_source,
        'status', old.status,
        'statusReason', old.status_reason
      ) end,
      jsonb_build_object(
        'patientId', new.patient_id,
        'category', new.category,
        'earScope', new.ear_scope,
        'onset', new.onset,
        'source', new.information_source,
        'status', new.status,
        'statusReason', new.status_reason,
        'affectsClinicalRules', false
      )
    );
  end if;
  return new;
end;
$$;
create trigger hospital_patient_hearing_conditions_audit_change
after insert or update on public.hospital_patient_hearing_conditions
for each row execute function public.audit_patient_hearing_condition_change();

-- 20260902000000_phase12_nihl_evidence_review.sql

-- Phase 12: non-diagnostic NIHL evidence profile. This module organizes
-- exposure, audiogram-shape, longitudinal and alternative-cause evidence for
-- physician review. It cannot mutate Thai/OSHA/NIOSH surveillance results,
-- operational baselines or follow-up cases.

insert into public.rule_sets (
  code, name, version, jurisdiction, effective_date, status,
  reference_title, reference_url, notes, configuration_json
) values (
  'NIHL_EVIDENCE_PROFILE',
  'NIHL evidence profile (suggestion only)',
  '1.0.0',
  'CLINICAL_EVIDENCE_SUPPORT',
  date '2026-09-02',
  'ACTIVE',
  'NIOSH Occupational Noise Exposure Criteria and ACOEM Occupational Noise-Induced Hearing Loss guidance',
  'https://www.cdc.gov/niosh/docs/98-126/default.html',
  'Non-diagnostic evidence organization only. Does not implement ISO 1999 NIPTS estimation, age correction, causal apportionment, or an automatic diagnosis.',
  jsonb_build_object(
    'nioshCriterionDbA', 85,
    'nioshExchangeRateDb', 3,
    'nioshCriterionHours', 8,
    'notchDetectors', jsonb_build_array('COLeskyBroadNotch', 'FOUR_KHZ_SPECIFIC'),
    'notchIndependentFromThresholdShift', true,
    'automaticDiagnosis', false,
    'automaticBaselineChange', false,
    'thaiFollowUpMutation', false,
    'references', jsonb_build_array(
      jsonb_build_object('title', 'NIOSH Criteria for a Recommended Standard: Occupational Noise Exposure', 'url', 'https://www.cdc.gov/niosh/docs/98-126/default.html'),
      jsonb_build_object('title', 'ACOEM Occupational Noise-Induced Hearing Loss', 'url', 'https://acoem.org/Guidance-and-Position-Statements/Guidance-and-Position-Statements/Occupational-Noise-Induced-Hearing-Loss'),
      jsonb_build_object('title', 'OSHA Occupational Noise Exposure', 'url', 'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95')
    )
  )
) on conflict (code, version) do update set
  name = excluded.name,
  reference_title = excluded.reference_title,
  reference_url = excluded.reference_url,
  notes = excluded.notes,
  configuration_json = excluded.configuration_json;
create table public.patient_noise_exposure_periods (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid,
  employer_name text not null,
  job_title text,
  start_date date not null,
  end_date date,
  hours_per_day numeric(4, 1),
  days_per_week numeric(3, 1),
  weeks_per_year numeric(4, 1),
  exposure_pattern text not null default 'UNKNOWN',
  impulse_noise boolean not null default false,
  information_source text not null,
  confidence text not null default 'UNKNOWN',
  notes text,
  status text not null default 'ACTIVE',
  status_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint patient_noise_period_employee_scope
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint patient_noise_period_dates_valid check (end_date is null or end_date >= start_date),
  constraint patient_noise_period_hours_valid check (hours_per_day is null or hours_per_day > 0 and hours_per_day <= 24),
  constraint patient_noise_period_days_valid check (days_per_week is null or days_per_week > 0 and days_per_week <= 7),
  constraint patient_noise_period_weeks_valid check (weeks_per_year is null or weeks_per_year > 0 and weeks_per_year <= 53),
  constraint patient_noise_period_pattern_valid check (exposure_pattern in ('CONTINUOUS', 'INTERMITTENT', 'FLUCTUATING', 'IMPULSE', 'MIXED', 'UNKNOWN')),
  constraint patient_noise_period_source_valid check (information_source in ('MEASURED', 'RECORD_REVIEW', 'PATIENT_RECALL')),
  constraint patient_noise_period_confidence_valid check (confidence in ('HIGH', 'MODERATE', 'LOW', 'UNKNOWN')),
  constraint patient_noise_period_status_valid check (status in ('ACTIVE', 'INACTIVE', 'ENTERED_IN_ERROR')),
  constraint patient_noise_period_status_reason check (status = 'ACTIVE' or nullif(btrim(status_reason), '') is not null),
  constraint patient_noise_period_employer_not_blank check (nullif(btrim(employer_name), '') is not null)
);
create trigger patient_noise_exposure_periods_set_updated_at
before update on public.patient_noise_exposure_periods
for each row execute function public.set_updated_at();
create index patient_noise_exposure_periods_patient_idx
  on public.patient_noise_exposure_periods (patient_id, start_date, end_date);
create index patient_noise_exposure_periods_org_idx
  on public.patient_noise_exposure_periods (organization_id, status, start_date desc);
create table public.patient_noise_exposure_sources (
  id uuid primary key default gen_random_uuid(),
  exposure_period_id uuid not null references public.patient_noise_exposure_periods(id) on delete cascade,
  noise_exposure_id uuid references public.noise_exposures(id) on delete restrict,
  measurement_kind text not null,
  metric text not null,
  level_db_a numeric(5, 1),
  dose_percent numeric(8, 2),
  measurement_duration_hours numeric(5, 2),
  exchange_rate_db numeric(3, 1),
  criterion_level_db_a numeric(5, 1),
  measurement_date date,
  representative_from date,
  representative_to date,
  quality text not null default 'UNKNOWN',
  notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint patient_noise_source_kind_valid check (measurement_kind in ('PERSONAL_DOSIMETRY', 'AREA_MEASUREMENT', 'REPRESENTATIVE_JOB_GROUP', 'RECORD_REVIEW', 'PATIENT_RECALL')),
  constraint patient_noise_source_metric_valid check (metric in ('LEX_8H', 'LAEQ_TE', 'DAILY_DOSE')),
  constraint patient_noise_source_metric_value check (
    (metric in ('LEX_8H', 'LAEQ_TE') and level_db_a is not null and dose_percent is null)
    or (metric = 'DAILY_DOSE' and dose_percent is not null and level_db_a is null)
  ),
  constraint patient_noise_source_level_valid check (level_db_a is null or level_db_a between 40 and 160),
  constraint patient_noise_source_dose_valid check (dose_percent is null or dose_percent >= 0),
  constraint patient_noise_source_duration_valid check (measurement_duration_hours is null or measurement_duration_hours > 0 and measurement_duration_hours <= 24),
  constraint patient_noise_source_quality_valid check (quality in ('HIGH', 'MODERATE', 'LOW', 'UNKNOWN')),
  constraint patient_noise_source_range_valid check (representative_to is null or representative_from is null or representative_to >= representative_from)
);
create index patient_noise_exposure_sources_period_idx
  on public.patient_noise_exposure_sources (exposure_period_id, measurement_date desc);
create table public.patient_hearing_protection_periods (
  id uuid primary key default gen_random_uuid(),
  exposure_period_id uuid not null references public.patient_noise_exposure_periods(id) on delete cascade,
  start_date date,
  end_date date,
  protection_type text not null,
  wearing_time_percent numeric(5, 2),
  attenuation_method text not null default 'UNKNOWN',
  attenuation_db numeric(5, 1),
  fit_test_date date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint patient_hpp_dates_valid check (end_date is null or start_date is null or end_date >= start_date),
  constraint patient_hpp_type_not_blank check (nullif(btrim(protection_type), '') is not null),
  constraint patient_hpp_wearing_time_valid check (wearing_time_percent is null or wearing_time_percent between 0 and 100),
  constraint patient_hpp_method_valid check (attenuation_method in ('PAR', 'NRR', 'NONE', 'UNKNOWN')),
  constraint patient_hpp_attenuation_valid check (attenuation_db is null or attenuation_db between 0 and 60),
  constraint patient_hpp_par_complete check (attenuation_method <> 'PAR' or (attenuation_db is not null and wearing_time_percent is not null))
);
create index patient_hearing_protection_periods_period_idx
  on public.patient_hearing_protection_periods (exposure_period_id, start_date);
create table public.nihl_evidence_assessments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.hospital_patients(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  current_audiogram_id uuid not null,
  rule_set_id uuid not null references public.rule_sets(id) on delete restrict,
  rule_version text not null,
  qualitative_state text not null,
  completeness text not null,
  evidence_json jsonb not null,
  explanation text not null,
  record_status text not null default 'CURRENT',
  supersedes_assessment_id uuid references public.nihl_evidence_assessments(id) on delete restrict,
  superseded_by_assessment_id uuid references public.nihl_evidence_assessments(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint nihl_assessment_employee_scope
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint nihl_assessment_audiogram_scope
    foreign key (current_audiogram_id, employee_id, organization_id)
    references public.audiograms(id, employee_id, organization_id) on delete restrict,
  constraint nihl_assessment_state_valid check (qualitative_state in (
    'EXPOSURE_AND_PATTERN_COMPATIBLE',
    'COMPATIBLE_WITH_MIXED_FACTORS',
    'ATYPICAL_FEATURES_PRESENT',
    'CURRENT_EVIDENCE_NOT_SUPPORTIVE',
    'INSUFFICIENT_DATA'
  )),
  constraint nihl_assessment_completeness_valid check (completeness in ('COMPLETE', 'PARTIAL', 'ACCESS_LIMITED')),
  constraint nihl_assessment_record_status_valid check (record_status in ('CURRENT', 'SUPERSEDED')),
  constraint nihl_assessment_evidence_object check (jsonb_typeof(evidence_json) = 'object'),
  constraint nihl_assessment_non_diagnostic check (coalesce((evidence_json ->> 'nonDiagnostic')::boolean, false)),
  constraint nihl_assessment_no_automatic_mutation check (
    coalesce((evidence_json ->> 'automaticDiagnosis')::boolean, false) = false
    and coalesce((evidence_json ->> 'automaticBaselineChange')::boolean, false) = false
    and coalesce((evidence_json ->> 'thaiFollowUpMutation')::boolean, false) = false
  )
);
create unique index nihl_evidence_one_current_per_audiogram
  on public.nihl_evidence_assessments (current_audiogram_id)
  where record_status = 'CURRENT';
create index nihl_evidence_assessments_patient_idx
  on public.nihl_evidence_assessments (patient_id, created_at desc);
create index nihl_evidence_assessments_employee_idx
  on public.nihl_evidence_assessments (employee_id, created_at desc);
create table public.nihl_physician_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references public.nihl_evidence_assessments(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  decision text not null,
  review_note text not null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default timezone('utc', now()),
  constraint nihl_physician_review_decision_valid check (decision in (
    'AGREE_COMPATIBLE',
    'MIXED_OR_MULTIFACTORIAL',
    'ALTERNATIVE_CAUSE_MORE_LIKELY',
    'DEFER_NEED_MORE_DATA'
  )),
  constraint nihl_physician_review_note_not_blank check (nullif(btrim(review_note), '') is not null)
);
alter table public.patient_noise_exposure_periods enable row level security;
alter table public.patient_noise_exposure_sources enable row level security;
alter table public.patient_hearing_protection_periods enable row level security;
alter table public.nihl_evidence_assessments enable row level security;
alter table public.nihl_physician_reviews enable row level security;
create policy patient_noise_periods_hospital_read
on public.patient_noise_exposure_periods for select to public
using (public.is_hospital_clinical_user() and public.can_access_organization(organization_id));
create policy patient_noise_sources_hospital_read
on public.patient_noise_exposure_sources for select to public
using (exists (
  select 1 from public.patient_noise_exposure_periods period
  where period.id = patient_noise_exposure_sources.exposure_period_id
    and public.is_hospital_clinical_user()
    and public.can_access_organization(period.organization_id)
));
create policy patient_hpp_hospital_read
on public.patient_hearing_protection_periods for select to public
using (exists (
  select 1 from public.patient_noise_exposure_periods period
  where period.id = patient_hearing_protection_periods.exposure_period_id
    and public.is_hospital_clinical_user()
    and public.can_access_organization(period.organization_id)
));
create policy nihl_assessments_hospital_read
on public.nihl_evidence_assessments for select to public
using (public.is_hospital_clinical_user() and public.can_access_organization(organization_id));
create policy nihl_reviews_hospital_read
on public.nihl_physician_reviews for select to public
using (public.is_hospital_clinical_user() and public.can_access_organization(organization_id));
create or replace function public.save_patient_noise_exposure_period(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  period_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  saved public.patient_noise_exposure_periods%rowtype;
  source jsonb;
  protection jsonb;
begin
  select * into target_employee
  from public.employees
  where id = (p_payload ->> 'employeeId')::uuid;

  if target_employee.id is null or target_employee.patient_id is null
    or not public.is_hospital_clinical_user()
    or not public.can_manage_organization(target_employee.organization_id)
  then
    raise exception 'Noise-exposure history is outside the actor scope' using errcode = '42501';
  end if;

  if period_id is null then
    insert into public.patient_noise_exposure_periods (
      patient_id, organization_id, employee_id, employer_name, job_title,
      start_date, end_date, hours_per_day, days_per_week, weeks_per_year,
      exposure_pattern, impulse_noise, information_source, confidence, notes,
      status, status_reason, created_by, updated_by
    ) values (
      target_employee.patient_id, target_employee.organization_id, target_employee.id,
      btrim(p_payload ->> 'employerName'), nullif(btrim(p_payload ->> 'jobTitle'), ''),
      (p_payload ->> 'startDate')::date, nullif(p_payload ->> 'endDate', '')::date,
      nullif(p_payload ->> 'hoursPerDay', '')::numeric,
      nullif(p_payload ->> 'daysPerWeek', '')::numeric,
      nullif(p_payload ->> 'weeksPerYear', '')::numeric,
      p_payload ->> 'exposurePattern', coalesce((p_payload ->> 'impulseNoise')::boolean, false),
      p_payload ->> 'informationSource', p_payload ->> 'confidence',
      nullif(btrim(p_payload ->> 'notes'), ''), coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE'),
      nullif(btrim(p_payload ->> 'statusReason'), ''), auth.uid(), auth.uid()
    ) returning * into saved;
  else
    update public.patient_noise_exposure_periods
    set employer_name = btrim(p_payload ->> 'employerName'),
        job_title = nullif(btrim(p_payload ->> 'jobTitle'), ''),
        start_date = (p_payload ->> 'startDate')::date,
        end_date = nullif(p_payload ->> 'endDate', '')::date,
        hours_per_day = nullif(p_payload ->> 'hoursPerDay', '')::numeric,
        days_per_week = nullif(p_payload ->> 'daysPerWeek', '')::numeric,
        weeks_per_year = nullif(p_payload ->> 'weeksPerYear', '')::numeric,
        exposure_pattern = p_payload ->> 'exposurePattern',
        impulse_noise = coalesce((p_payload ->> 'impulseNoise')::boolean, false),
        information_source = p_payload ->> 'informationSource',
        confidence = p_payload ->> 'confidence',
        notes = nullif(btrim(p_payload ->> 'notes'), ''),
        status = coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE'),
        status_reason = nullif(btrim(p_payload ->> 'statusReason'), ''),
        updated_by = auth.uid()
    where id = period_id
      and patient_id = target_employee.patient_id
      and organization_id = target_employee.organization_id
    returning * into saved;
    if saved.id is null then
      raise exception 'Noise-exposure period not found in this HN/organization scope' using errcode = 'P0002';
    end if;
    delete from public.patient_noise_exposure_sources where exposure_period_id = saved.id;
    delete from public.patient_hearing_protection_periods where exposure_period_id = saved.id;
  end if;

  for source in select value from jsonb_array_elements(coalesce(p_payload -> 'sources', '[]'::jsonb)) loop
    insert into public.patient_noise_exposure_sources (
      exposure_period_id, noise_exposure_id, measurement_kind, metric,
      level_db_a, dose_percent, measurement_duration_hours, exchange_rate_db,
      criterion_level_db_a, measurement_date, representative_from,
      representative_to, quality, notes, verified_by, verified_at
    ) values (
      saved.id, nullif(source ->> 'noiseExposureId', '')::uuid,
      source ->> 'measurementKind', source ->> 'metric',
      nullif(source ->> 'levelDbA', '')::numeric,
      nullif(source ->> 'dosePercent', '')::numeric,
      nullif(source ->> 'measurementDurationHours', '')::numeric,
      nullif(source ->> 'exchangeRateDb', '')::numeric,
      nullif(source ->> 'criterionLevelDbA', '')::numeric,
      nullif(source ->> 'measurementDate', '')::date,
      nullif(source ->> 'representativeFrom', '')::date,
      nullif(source ->> 'representativeTo', '')::date,
      source ->> 'quality', nullif(btrim(source ->> 'notes'), ''),
      case when coalesce((source ->> 'verified')::boolean, false) then auth.uid() else null end,
      case when coalesce((source ->> 'verified')::boolean, false) then timezone('utc', now()) else null end
    );
  end loop;

  for protection in select value from jsonb_array_elements(coalesce(p_payload -> 'hearingProtection', '[]'::jsonb)) loop
    insert into public.patient_hearing_protection_periods (
      exposure_period_id, start_date, end_date, protection_type,
      wearing_time_percent, attenuation_method, attenuation_db, fit_test_date, notes
    ) values (
      saved.id, nullif(protection ->> 'startDate', '')::date,
      nullif(protection ->> 'endDate', '')::date,
      btrim(protection ->> 'protectionType'),
      nullif(protection ->> 'wearingTimePercent', '')::numeric,
      protection ->> 'attenuationMethod',
      nullif(protection ->> 'attenuationDb', '')::numeric,
      nullif(protection ->> 'fitTestDate', '')::date,
      nullif(btrim(protection ->> 'notes'), '')
    );
  end loop;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (
    target_employee.organization_id, 'patient_noise_exposure_period', saved.id,
    case when period_id is null then 'PATIENT_NOISE_EXPOSURE_RECORDED' else 'PATIENT_NOISE_EXPOSURE_UPDATED' end,
    jsonb_build_object('patientId', target_employee.patient_id, 'employeeId', target_employee.id,
      'status', saved.status, 'sourceCount', jsonb_array_length(coalesce(p_payload -> 'sources', '[]'::jsonb)))
  );
  return saved.id;
end;
$$;
create or replace function public.persist_nihl_evidence_assessment(
  p_employee_id uuid,
  p_current_audiogram_id uuid,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  target_audiogram public.audiograms%rowtype;
  selected_rule public.rule_sets%rowtype;
  previous_id uuid;
  saved_id uuid;
begin
  select * into target_employee from public.employees where id = p_employee_id;
  select * into target_audiogram from public.audiograms where id = p_current_audiogram_id;
  select * into selected_rule from public.rule_sets
    where code = 'NIHL_EVIDENCE_PROFILE' and version = p_result ->> 'ruleVersion';

  if target_employee.id is null or target_employee.patient_id is null
    or target_audiogram.id is null or target_audiogram.employee_id <> target_employee.id
    or target_audiogram.organization_id <> target_employee.organization_id
    or target_audiogram.record_status <> 'FINAL' or not target_audiogram.is_valid
    or selected_rule.id is null
    or not public.is_hospital_clinical_user()
    or not public.can_access_organization(target_employee.organization_id)
  then
    raise exception 'NIHL assessment target is invalid or outside the actor scope' using errcode = '42501';
  end if;
  if coalesce((p_result ->> 'nonDiagnostic')::boolean, false) is not true
    or coalesce((p_result ->> 'automaticDiagnosis')::boolean, false)
    or coalesce((p_result ->> 'automaticBaselineChange')::boolean, false)
    or coalesce((p_result ->> 'thaiFollowUpMutation')::boolean, false)
  then
    raise exception 'NIHL assessment must remain non-diagnostic and non-mutating' using errcode = '23514';
  end if;

  select id into previous_id
  from public.nihl_evidence_assessments
  where current_audiogram_id = p_current_audiogram_id and record_status = 'CURRENT'
  for update;

  if previous_id is not null then
    update public.nihl_evidence_assessments set record_status = 'SUPERSEDED'
    where id = previous_id;
  end if;

  insert into public.nihl_evidence_assessments (
    patient_id, organization_id, employee_id, current_audiogram_id,
    rule_set_id, rule_version, qualitative_state, completeness,
    evidence_json, explanation, supersedes_assessment_id, created_by
  ) values (
    target_employee.patient_id, target_employee.organization_id, target_employee.id,
    target_audiogram.id, selected_rule.id, p_result ->> 'ruleVersion',
    p_result ->> 'state', p_result ->> 'completeness', p_result,
    p_result ->> 'explanation', previous_id, auth.uid()
  ) returning id into saved_id;

  if previous_id is not null then
    update public.nihl_evidence_assessments set superseded_by_assessment_id = saved_id
    where id = previous_id;
  end if;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (target_employee.organization_id, 'nihl_evidence_assessment', saved_id,
    'NIHL_EVIDENCE_ASSESSMENT_CREATED',
    jsonb_build_object('patientId', target_employee.patient_id, 'employeeId', target_employee.id,
      'audiogramId', target_audiogram.id, 'state', p_result ->> 'state',
      'nonDiagnostic', true, 'supersedesAssessmentId', previous_id));
  return saved_id;
end;
$$;
create or replace function public.review_nihl_evidence_assessment(
  p_assessment_id uuid,
  p_decision text,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.nihl_evidence_assessments%rowtype;
  saved_id uuid;
begin
  select * into target from public.nihl_evidence_assessments where id = p_assessment_id;
  if target.id is null or target.record_status <> 'CURRENT'
    or not public.can_review_baseline(target.organization_id)
  then
    raise exception 'Only an assigned occupational physician may review the current NIHL assessment' using errcode = '42501';
  end if;
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'Physician review note is required' using errcode = '23514';
  end if;

  insert into public.nihl_physician_reviews (
    assessment_id, organization_id, decision, review_note, reviewed_by
  ) values (target.id, target.organization_id, p_decision, btrim(p_review_note), auth.uid())
  returning id into saved_id;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (target.organization_id, 'nihl_physician_review', saved_id,
    'NIHL_PHYSICIAN_REVIEW_RECORDED',
    jsonb_build_object('assessmentId', target.id, 'decision', p_decision,
      'changesDiagnosis', false, 'changesBaseline', false, 'changesThaiFollowUp', false));
  return saved_id;
end;
$$;
comment on table public.nihl_evidence_assessments is
  'Versioned, non-diagnostic NIHL evidence profiles. Threshold shift and audiometric notch remain independent evidence dimensions.';
comment on function public.persist_nihl_evidence_assessment(uuid, uuid, jsonb) is
  'Persists an immutable NIHL suggestion snapshot without modifying diagnosis, baseline, surveillance evaluation or follow-up workflow.';

-- 20260914000000_consolidate_follow_up_confirmation.sql

-- New Thai follow-up examinations use CONFIRMATION. REPEAT remains readable
-- and correctable for legacy records, but cannot be created as a new episode.

create or replace function public.enforce_legacy_repeat_audiogram_boundary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or new.exam_type <> 'REPEAT' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.exam_type = 'REPEAT' then
    return new;
  end if;

  if new.supersedes_audiogram_id is not null then
    return new;
  end if;

  raise exception 'New follow-up audiograms must use CONFIRMATION; REPEAT is legacy-only'
    using errcode = '23514';
end;
$$;
create trigger audiograms_enforce_legacy_repeat_boundary
before insert or update on public.audiograms
for each row execute function public.enforce_legacy_repeat_audiogram_boundary();
create or replace function public.enforce_legacy_repeat_import_boundary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or new.exam_type <> 'REPEAT' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.exam_type = 'REPEAT' then
    return new;
  end if;

  raise exception 'New import batches must use CONFIRMATION; REPEAT is legacy-only'
    using errcode = '23514';
end;
$$;
create trigger import_batches_enforce_legacy_repeat_boundary
before insert or update on public.import_batches
for each row execute function public.enforce_legacy_repeat_import_boundary();

-- 20260915000000_phase17_hearing_protection_effectiveness.sql

-- Hearing Protection Effectiveness (product Phase 10; repository migration phase 17).
-- Historical noise rows remain UNSPECIFIED because the original twa_db_a column
-- did not establish whether its values were normalized 8-hour TWA or a shift average.

create extension if not exists btree_gist with schema extensions;
alter table public.noise_exposures
  add column twa_db_c numeric(5, 1),
  add column exposure_basis text not null default 'UNSPECIFIED',
  drop constraint noise_exposure_at_least_one_measurement,
  add constraint noise_exposure_at_least_one_measurement check (
    twa_db_a is not null or twa_db_c is not null or lel_db_a is not null or peak_db is not null
  ),
  add constraint noise_exposure_basis_valid check (
    exposure_basis in ('EIGHT_HOUR_TWA', 'SHIFT_AVERAGE', 'UNSPECIFIED')
  ),
  add constraint noise_exposure_id_organization_unique unique (id, organization_id);
comment on column public.noise_exposures.twa_db_a is
  'A-weighted exposure value. Interpret duration normalization only through exposure_basis; legacy rows are UNSPECIFIED.';
comment on column public.noise_exposures.twa_db_c is
  'C-weighted exposure value measured on the same basis and duration as twa_db_a. Required for Thai SNR assessment.';
comment on column public.noise_exposures.exposure_basis is
  'EIGHT_HOUR_TWA, SHIFT_AVERAGE over shift_hours, or UNSPECIFIED. Historical values are never silently reinterpreted.';
create table public.hearing_protectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  manufacturer text not null,
  model text not null,
  protector_type text not null,
  nrr_db numeric(5, 2),
  snr_db numeric(5, 2),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hearing_protectors_id_scope_unique unique (id, organization_id),
  constraint hearing_protectors_manufacturer_not_blank check (btrim(manufacturer) <> ''),
  constraint hearing_protectors_model_not_blank check (btrim(model) <> ''),
  constraint hearing_protectors_type_valid check (
    protector_type in ('EARMUFF', 'FOAM_EARPLUG', 'OTHER_EARPLUG')
  ),
  constraint hearing_protectors_nrr_valid check (nrr_db is null or nrr_db between 0 and 60),
  constraint hearing_protectors_snr_valid check (snr_db is null or snr_db between 0 and 60),
  constraint hearing_protectors_rating_present check (nrr_db is not null or snr_db is not null),
  constraint hearing_protectors_org_product_unique unique (organization_id, manufacturer, model)
);
create table public.employee_hearing_protector_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  hearing_protector_id uuid not null,
  secondary_hearing_protector_id uuid,
  configuration text not null default 'SINGLE',
  effective_from date not null,
  effective_to date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hearing_protector_assignment_employee_scope
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint hearing_protector_assignment_primary_scope
    foreign key (hearing_protector_id, organization_id)
    references public.hearing_protectors(id, organization_id) on delete restrict,
  constraint hearing_protector_assignment_secondary_scope
    foreign key (secondary_hearing_protector_id, organization_id)
    references public.hearing_protectors(id, organization_id) on delete restrict,
  constraint hearing_protector_assignment_id_scope_unique
    unique (id, organization_id, employee_id),
  constraint hearing_protector_assignment_configuration_valid check (
    configuration in ('SINGLE', 'DUAL_UNSUPPORTED')
  ),
  constraint hearing_protector_assignment_dates_valid check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint hearing_protector_assignment_configuration_consistent check (
    (configuration = 'SINGLE' and secondary_hearing_protector_id is null)
    or (
      configuration = 'DUAL_UNSUPPORTED'
      and secondary_hearing_protector_id is not null
      and secondary_hearing_protector_id <> hearing_protector_id
    )
  ),
  exclude using gist (
    employee_id with =,
    daterange(
      effective_from,
      case when effective_to is null then 'infinity'::date else effective_to + 1 end,
      '[)'
    ) with &&
  )
);
create table public.hearing_protection_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  assignment_id uuid not null,
  noise_exposure_id uuid,
  status text not null,
  protected_exposure_db_a numeric(6, 2),
  allowable_exposure_db_a numeric(6, 2),
  protection_margin_db numeric(6, 2),
  governing_method text,
  rule_code text not null,
  rule_version text not null,
  input_snapshot_json jsonb not null,
  calculations_json jsonb not null,
  reasons_json jsonb not null default '[]'::jsonb,
  assessed_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint hearing_protection_assessment_employee_scope
    foreign key (employee_id, organization_id)
    references public.employees(id, organization_id) on delete restrict,
  constraint hearing_protection_assessment_assignment_scope
    foreign key (assignment_id, organization_id, employee_id)
    references public.employee_hearing_protector_assignments(id, organization_id, employee_id) on delete restrict,
  constraint hearing_protection_assessment_exposure_scope
    foreign key (noise_exposure_id, organization_id)
    references public.noise_exposures(id, organization_id) on delete restrict,
  constraint hearing_protection_assessment_rule_version
    foreign key (rule_code, rule_version)
    references public.rule_sets(code, version) on delete restrict,
  constraint hearing_protection_assessment_status_valid check (
    status in ('ADEQUATE', 'INADEQUATE', 'INSUFFICIENT_DATA', 'NOT_EVALUABLE')
  ),
  constraint hearing_protection_assessment_method_valid check (
    governing_method is null
    or governing_method in ('THAI_NRR_DBA', 'THAI_NRR_DBC', 'THAI_SNR')
  ),
  constraint hearing_protection_assessment_result_consistent check (
    (
      status in ('ADEQUATE', 'INADEQUATE')
      and protected_exposure_db_a is not null
      and allowable_exposure_db_a is not null
      and protection_margin_db is not null
      and governing_method is not null
    )
    or status in ('INSUFFICIENT_DATA', 'NOT_EVALUABLE')
  ),
  constraint hearing_protection_assessment_input_object check (
    jsonb_typeof(input_snapshot_json) = 'object'
  ),
  constraint hearing_protection_assessment_calculations_array check (
    jsonb_typeof(calculations_json) = 'array'
  ),
  constraint hearing_protection_assessment_reasons_array check (
    jsonb_typeof(reasons_json) = 'array'
  )
);
create index hearing_protectors_organization_active_idx
  on public.hearing_protectors (organization_id, active, manufacturer, model);
create index hearing_protector_assignments_employee_date_idx
  on public.employee_hearing_protector_assignments (employee_id, effective_from desc);
create index hearing_protection_assessments_employee_date_idx
  on public.hearing_protection_assessments (employee_id, assessed_at desc, created_at desc);
create trigger hearing_protectors_set_updated_at
before update on public.hearing_protectors
for each row execute function public.set_updated_at();
create trigger hearing_protector_assignments_set_updated_at
before update on public.employee_hearing_protector_assignments
for each row execute function public.set_updated_at();
alter table public.hearing_protectors enable row level security;
alter table public.employee_hearing_protector_assignments enable row level security;
alter table public.hearing_protection_assessments enable row level security;
create policy hearing_protectors_authorized_read
on public.hearing_protectors for select to public
using (public.can_access_organization(organization_id));
create policy hearing_protectors_staff_insert
on public.hearing_protectors for insert to public
with check (public.can_manage_organization(organization_id));
create policy hearing_protectors_staff_update
on public.hearing_protectors for update to public
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy hearing_protector_assignments_authorized_read
on public.employee_hearing_protector_assignments for select to public
using (public.can_access_organization(organization_id));
create policy hearing_protection_assessments_authorized_read
on public.hearing_protection_assessments for select to public
using (public.can_access_organization(organization_id));
create or replace function public.audit_hearing_protector_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, old_values_json, new_values_json
  ) values (
    new.organization_id,
    'hearing_protector',
    new.id,
    case when tg_op = 'INSERT' then 'HEARING_PROTECTOR_CREATED' else 'HEARING_PROTECTOR_UPDATED' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'created_at' - 'updated_at' else null end,
    to_jsonb(new) - 'created_at' - 'updated_at'
  );
  return new;
end;
$$;
create trigger hearing_protectors_audit_change
after insert or update on public.hearing_protectors
for each row execute function public.audit_hearing_protector_catalog_change();
create or replace function public.assign_hearing_protector_and_record_assessment(
  p_employee_id uuid,
  p_hearing_protector_id uuid,
  p_secondary_hearing_protector_id uuid,
  p_configuration text,
  p_effective_from date,
  p_notes text,
  p_noise_exposure_id uuid,
  p_status text,
  p_protected_exposure_db_a numeric,
  p_allowable_exposure_db_a numeric,
  p_protection_margin_db numeric,
  p_governing_method text,
  p_rule_code text,
  p_rule_version text,
  p_input_snapshot_json jsonb,
  p_calculations_json jsonb,
  p_reasons_json jsonb,
  p_assessed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  primary_protector public.hearing_protectors%rowtype;
  secondary_protector public.hearing_protectors%rowtype;
  target_exposure public.noise_exposures%rowtype;
  current_assignment public.employee_hearing_protector_assignments%rowtype;
  new_assignment_id uuid;
  new_assessment_id uuid;
begin
  select * into target_employee from public.employees where id = p_employee_id for update;
  if target_employee.id is null
    or not (
      coalesce(auth.role(), '') = 'service_role'
      or public.can_manage_organization(target_employee.organization_id)
    )
  then
    raise exception 'Not authorized to manage this employee hearing protector assignment'
      using errcode = '42501';
  end if;

  select * into primary_protector
  from public.hearing_protectors
  where id = p_hearing_protector_id
    and organization_id = target_employee.organization_id
    and active;
  if primary_protector.id is null then
    raise exception 'Primary hearing protector is inactive or outside the employee organization'
      using errcode = '23503';
  end if;

  if p_configuration not in ('SINGLE', 'DUAL_UNSUPPORTED') then
    raise exception 'Unsupported hearing protector configuration' using errcode = '22023';
  end if;
  if p_configuration = 'SINGLE' and p_secondary_hearing_protector_id is not null then
    raise exception 'Single protection cannot include a secondary protector' using errcode = '22023';
  end if;
  if p_configuration = 'DUAL_UNSUPPORTED' then
    select * into secondary_protector
    from public.hearing_protectors
    where id = p_secondary_hearing_protector_id
      and organization_id = target_employee.organization_id
      and active;
    if secondary_protector.id is null or secondary_protector.id = primary_protector.id then
      raise exception 'Dual protection requires a different secondary protector in the same organization'
        using errcode = '23503';
    end if;
  end if;

  if p_noise_exposure_id is not null then
    select * into target_exposure
    from public.noise_exposures
    where id = p_noise_exposure_id
      and organization_id = target_employee.organization_id
      and (
        employee_id = target_employee.id
        or (
          employee_id is null
          and department_id is not distinct from target_employee.department_id
        )
      );
    if target_exposure.id is null then
      raise exception 'Noise exposure is not applicable to this employee'
        using errcode = '23503';
    end if;
  end if;

  select * into current_assignment
  from public.employee_hearing_protector_assignments
  where employee_id = target_employee.id
    and effective_to is null
  order by effective_from desc
  limit 1
  for update;

  if current_assignment.id is not null then
    if current_assignment.effective_from >= p_effective_from then
      raise exception 'New assignment must start after the current assignment began'
        using errcode = '23514';
    end if;
    update public.employee_hearing_protector_assignments
    set effective_to = p_effective_from - 1
    where id = current_assignment.id;

    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action, old_values_json, new_values_json
    ) values (
      target_employee.organization_id,
      'employee_hearing_protector_assignment',
      current_assignment.id,
      'HEARING_PROTECTOR_ASSIGNMENT_ENDED',
      jsonb_build_object('effectiveTo', current_assignment.effective_to),
      jsonb_build_object('effectiveTo', p_effective_from - 1)
    );
  end if;

  insert into public.employee_hearing_protector_assignments (
    organization_id,
    employee_id,
    hearing_protector_id,
    secondary_hearing_protector_id,
    configuration,
    effective_from,
    notes,
    created_by
  ) values (
    target_employee.organization_id,
    target_employee.id,
    primary_protector.id,
    p_secondary_hearing_protector_id,
    p_configuration,
    p_effective_from,
    nullif(btrim(p_notes), ''),
    auth.uid()
  ) returning id into new_assignment_id;

  insert into public.hearing_protection_assessments (
    organization_id,
    employee_id,
    assignment_id,
    noise_exposure_id,
    status,
    protected_exposure_db_a,
    allowable_exposure_db_a,
    protection_margin_db,
    governing_method,
    rule_code,
    rule_version,
    input_snapshot_json,
    calculations_json,
    reasons_json,
    assessed_at,
    created_by
  ) values (
    target_employee.organization_id,
    target_employee.id,
    new_assignment_id,
    p_noise_exposure_id,
    p_status,
    p_protected_exposure_db_a,
    p_allowable_exposure_db_a,
    p_protection_margin_db,
    p_governing_method,
    p_rule_code,
    p_rule_version,
    p_input_snapshot_json,
    p_calculations_json,
    p_reasons_json,
    p_assessed_at,
    auth.uid()
  ) returning id into new_assessment_id;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_employee.organization_id,
    'employee_hearing_protector_assignment',
    new_assignment_id,
    'HEARING_PROTECTOR_ASSIGNED',
    jsonb_build_object(
      'employeeId', target_employee.id,
      'hearingProtectorId', primary_protector.id,
      'secondaryHearingProtectorId', p_secondary_hearing_protector_id,
      'configuration', p_configuration,
      'effectiveFrom', p_effective_from
    )
  );

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action, new_values_json
  ) values (
    target_employee.organization_id,
    'hearing_protection_assessment',
    new_assessment_id,
    'HEARING_PROTECTION_ASSESSED',
    jsonb_build_object(
      'employeeId', target_employee.id,
      'assignmentId', new_assignment_id,
      'noiseExposureId', p_noise_exposure_id,
      'status', p_status,
      'protectedExposureDbA', p_protected_exposure_db_a,
      'allowableExposureDbA', p_allowable_exposure_db_a,
      'protectionMarginDb', p_protection_margin_db,
      'governingMethod', p_governing_method,
      'ruleCode', p_rule_code,
      'ruleVersion', p_rule_version,
      'assessedAt', p_assessed_at
    )
  );

  return jsonb_build_object(
    'assignmentId', new_assignment_id,
    'assessmentId', new_assessment_id
  );
end;
$$;
insert into public.rule_sets (
  code,
  name,
  version,
  jurisdiction,
  effective_date,
  status,
  reference_title,
  reference_url,
  notes,
  configuration_json
) values (
  'THAI_HEARING_PROTECTION_2561',
  'Thai hearing protection effectiveness estimate B.E. 2561',
  '1.0.0',
  'Thailand',
  date '2018-02-14',
  'ACTIVE',
  'ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง การคำนวณระดับเสียงที่สัมผัสในหูเมื่อสวมใส่อุปกรณ์คุ้มครองความปลอดภัยส่วนบุคคล พ.ศ. 2561',
  'https://ratchakitcha.soc.go.th/documents/2133427.pdf',
  'Explainable occupational-health decision support. Label NRR/SNR estimates do not prove an individual worker achieved the estimated attenuation. PAR is not calculated.',
  jsonb_build_object(
    'nrrDerating', jsonb_build_object(
      'EARMUFF', 0.75,
      'FOAM_EARPLUG', 0.50,
      'OTHER_EARPLUG', 0.30
    ),
    'nrrDbaFormula', 'dBA - (NRRadj - 7)',
    'nrrDbcFormula', 'dBC - NRRadj',
    'snrFormula', '(LC - SNR) + 4',
    'allowableDurationFormula', '8 / 2^((L - 85) / 3)',
    'multipleMethods', 'HIGHEST_PROTECTED_DBA_GOVERNS',
    'parImplemented', false
  )
);
comment on table public.hearing_protectors is
  'Organization-scoped hearing protector catalog with independently nullable NRR and SNR label ratings.';
comment on table public.employee_hearing_protector_assignments is
  'Effective-dated employee assignments. Overlap is prevented; dual protection is representable but explicitly unsupported by the phase 10 calculation engine.';
comment on table public.hearing_protection_assessments is
  'Immutable, versioned assessment snapshots preserving exposure, protector rating, every applicable calculation, and the governing result.';
comment on function public.assign_hearing_protector_and_record_assessment(
  uuid, uuid, uuid, text, date, text, uuid, text, numeric, numeric, numeric,
  text, text, text, jsonb, jsonb, jsonb, timestamptz
) is
  'Atomically replaces the current protector assignment and records an immutable, explainable assessment snapshot.';

-- 20261007000000_beerthip_xlsx_staging.sql

create table public.beerthip_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  status text not null default 'STAGED' check (status in (
    'STAGED', 'AWAITING_BASELINE_APPROVAL', 'REMAINDER_READY', 'COMPLETED'
  )),
  file_count integer not null check (file_count between 1 and 50),
  row_count integer not null check (row_count between 1 and 1000),
  ready_count integer not null default 0 check (ready_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  source_files_json jsonb not null check (jsonb_typeof(source_files_json) = 'array'),
  department_proposals_json jsonb not null check (jsonb_typeof(department_proposals_json) = 'array'),
  baselines_committed_at timestamptz,
  completed_at timestamptz,
  constraint beerthip_batch_counts_match check (ready_count + warning_count + error_count = row_count)
);
create table public.beerthip_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.beerthip_import_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  ordinal integer not null check (ordinal between 1 and 1000),
  source_filename text not null,
  source_row integer not null check (source_row between 9 and 27),
  employee_number text not null,
  exam_date date not null,
  exam_type text not null check (exam_type in ('BASELINE', 'ANNUAL', 'CONFIRMATION')),
  classification text not null check (classification in ('READY', 'WARNING', 'ERROR')),
  messages_json jsonb not null check (jsonb_typeof(messages_json) = 'array'),
  staged_data_json jsonb not null check (jsonb_typeof(staged_data_json) = 'object'),
  audiogram_id uuid references public.audiograms(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint beerthip_import_ordinal_unique unique (batch_id, ordinal),
  constraint beerthip_import_natural_unique unique (batch_id, employee_number, exam_date, exam_type)
);
create index beerthip_import_rows_lookup on public.beerthip_import_rows
  (batch_id, source_filename, employee_number, exam_type);
create trigger beerthip_import_batches_set_updated_at
before update on public.beerthip_import_batches
for each row execute function public.set_updated_at();
alter table public.beerthip_import_batches enable row level security;
alter table public.beerthip_import_rows enable row level security;
create policy beerthip_batches_read on public.beerthip_import_batches
for select to public using (public.can_access_organization(organization_id));
create policy beerthip_rows_read on public.beerthip_import_rows
for select to public using (public.can_access_organization(organization_id));
create or replace function public.stage_beerthip_xlsx_batch(
  p_organization_id uuid,
  p_files jsonb,
  p_departments jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  batch_id_value uuid;
  source_row jsonb;
  file_count_value integer;
  row_count_value integer;
begin
  if not public.can_manage_organization(p_organization_id) then
    raise exception 'Not authorized to stage Beerthip data' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and code = 'BEERTHIP_1991' and active
  ) then
    raise exception 'Beerthip organization is unavailable' using errcode = '23514';
  end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_typeof(p_departments) <> 'array'
    or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid staged payload' using errcode = '22023';
  end if;
  file_count_value := jsonb_array_length(p_files);
  row_count_value := jsonb_array_length(p_rows);
  if file_count_value < 1 or file_count_value > 50 or row_count_value < 1 or row_count_value > 1000 then
    raise exception 'Staged payload exceeds supported limits' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    where item ->> 'classification' not in ('READY', 'WARNING', 'ERROR')
      or jsonb_typeof(item -> 'data') <> 'object'
      or jsonb_typeof(item -> 'messages') <> 'array'
      or item #>> '{data,examType}' not in ('BASELINE', 'ANNUAL', 'CONFIRMATION')
      or jsonb_typeof(item #> '{data,observations}') <> 'array'
      or jsonb_array_length(item #> '{data,observations}') <> 14
  ) then
    raise exception 'Staged row has invalid structure' using errcode = '22023';
  end if;

  insert into public.beerthip_import_batches (
    organization_id, uploaded_by, file_count, row_count, ready_count,
    warning_count, error_count, source_files_json, department_proposals_json
  ) values (
    p_organization_id, auth.uid(), file_count_value, row_count_value,
    (select count(*) from jsonb_array_elements(p_rows) item where item ->> 'classification' = 'READY'),
    (select count(*) from jsonb_array_elements(p_rows) item where item ->> 'classification' = 'WARNING'),
    (select count(*) from jsonb_array_elements(p_rows) item where item ->> 'classification' = 'ERROR'),
    p_files, p_departments
  ) returning id into batch_id_value;

  for source_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.beerthip_import_rows (
      batch_id, organization_id, ordinal, source_filename, source_row,
      employee_number, exam_date, exam_type, classification, messages_json, staged_data_json
    ) values (
      batch_id_value, p_organization_id, (source_row ->> 'ordinal')::integer,
      source_row #>> '{data,sourceFilename}', (source_row #>> '{data,sourceRow}')::integer,
      source_row #>> '{data,employeeNumber}', (source_row #>> '{data,examDate}')::date,
      source_row #>> '{data,examType}', source_row ->> 'classification',
      source_row -> 'messages', source_row -> 'data'
    );
  end loop;

  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (p_organization_id, auth.uid(), 'beerthip_import_batch', batch_id_value, 'XLSX_STAGED',
    jsonb_build_object('fileCount', file_count_value, 'rowCount', row_count_value));
  return batch_id_value;
end;
$$;
create or replace function public.delete_staged_beerthip_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.beerthip_import_batches%rowtype;
begin
  select * into target from public.beerthip_import_batches where id = p_batch_id for update;
  if not found or not public.can_manage_organization(target.organization_id) then
    raise exception 'Not authorized to discard batch' using errcode = '42501';
  end if;
  if target.status <> 'STAGED' then
    raise exception 'Only staged batches can be discarded' using errcode = '23514';
  end if;
  delete from public.beerthip_import_batches where id = p_batch_id;
end;
$$;

-- 20261007020000_beerthip_historical_commit.sql

alter table public.audiograms
  add column beerthip_import_batch_id uuid references public.beerthip_import_batches(id) on delete restrict,
  add column source_provenance_json jsonb,
  add constraint audiograms_source_provenance_object check (
    source_provenance_json is null or jsonb_typeof(source_provenance_json) = 'object'
  );
create index audiograms_beerthip_import_batch_idx on public.audiograms (beerthip_import_batch_id)
where beerthip_import_batch_id is not null;
create or replace function public.commit_beerthip_baselines(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.beerthip_import_batches%rowtype;
  department_item jsonb;
  source_row public.beerthip_import_rows%rowtype;
  source_data jsonb;
  employee_record public.employees%rowtype;
  department_record public.departments%rowtype;
  audiogram_id_value uuid;
  imported_count integer := 0;
begin
  select * into target from public.beerthip_import_batches where id = p_batch_id for update;
  if not found or not public.can_manage_organization(target.organization_id) then
    raise exception 'Not authorized to commit Beerthip baselines' using errcode = '42501';
  end if;
  if target.status <> 'STAGED' or target.error_count <> 0 then
    raise exception 'Batch must be staged without errors' using errcode = '23514';
  end if;
  if (select count(*) from public.beerthip_import_rows
      where batch_id = p_batch_id and exam_type = 'BASELINE') <> target.file_count then
    raise exception 'Each source file requires one baseline' using errcode = '23514';
  end if;
  for department_item in select * from jsonb_array_elements(target.department_proposals_json)
  loop
    insert into public.departments (organization_id, code, name)
    values (target.organization_id, department_item ->> 'code', department_item ->> 'name')
    on conflict (organization_id, code) do nothing;
    if not exists (
      select 1 from public.departments
      where organization_id = target.organization_id
        and code = department_item ->> 'code'
        and name = department_item ->> 'name'
    ) then
      raise exception 'Department code conflicts with a different name' using errcode = '23514';
    end if;
  end loop;

  for source_row in
    select * from public.beerthip_import_rows
    where batch_id = p_batch_id and exam_type = 'BASELINE'
    order by ordinal
  loop
    source_data := source_row.staged_data_json;
    select * into department_record from public.departments
    where organization_id = target.organization_id and name = source_data ->> 'department';
    if not found then raise exception 'Department unavailable for row %', source_row.ordinal; end if;

    select * into employee_record from public.employees
    where organization_id = target.organization_id and employee_number = source_row.employee_number
    for update;
    if found then
      if employee_record.first_name <> source_data ->> 'firstName'
        or employee_record.last_name <> source_data ->> 'lastName' then
        raise exception 'Employee identity changed for row %', source_row.ordinal;
      end if;
    else
      insert into public.employees (
        organization_id, department_id, employee_number, first_name, last_name,
        sex, employment_start_date, active
      ) values (
        target.organization_id, department_record.id, source_row.employee_number,
        source_data ->> 'firstName', source_data ->> 'lastName',
        nullif(source_data ->> 'sex', ''),
        nullif(source_data ->> 'employmentStartDate', '')::date, true
      ) returning * into employee_record;
    end if;
    if exists (
      select 1 from public.audiograms
      where employee_id = employee_record.id and exam_date = source_row.exam_date
        and exam_type = 'BASELINE' and record_status = 'FINAL'
    ) then raise exception 'Baseline already exists for row %', source_row.ordinal; end if;

    insert into public.audiograms (
      organization_id, employee_id, exam_date, exam_type, is_valid, validation_notes,
      record_status, finalized_at, finalized_by, beerthip_import_batch_id,
      source_provenance_json
    ) values (
      target.organization_id, employee_record.id, source_row.exam_date, 'BASELINE', true,
      'Historical XLSX source; pretest and otoscopy evidence was not supplied.',
      'FINAL', timezone('utc', now()), auth.uid(), p_batch_id,
      source_data - 'observations' - 'thaiEvaluation' - 'oshaEvaluation'
    ) returning id into audiogram_id_value;

    insert into public.audiogram_thresholds (
      audiogram_id, ear, frequency_hz, response_status, threshold_db_hl
    ) select audiogram_id_value, point ->> 'ear',
      (point ->> 'frequencyHz')::integer, 'MEASURED',
      (point ->> 'thresholdDbHl')::numeric
    from jsonb_array_elements(source_data -> 'observations') point
    where point ->> 'responseStatus' = 'MEASURED';
    if (select count(*) from public.audiogram_thresholds where audiogram_id = audiogram_id_value) <> 14 then
      raise exception 'Baseline row % does not have 14 measured points', source_row.ordinal;
    end if;
    perform public.propose_initial_thai_baseline(audiogram_id_value);
    update public.beerthip_import_rows set audiogram_id = audiogram_id_value where id = source_row.id;
    imported_count := imported_count + 1;
  end loop;
  update public.beerthip_import_batches
    set status = 'AWAITING_BASELINE_APPROVAL', baselines_committed_at = timezone('utc', now())
    where id = p_batch_id;
  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (target.organization_id, auth.uid(), 'beerthip_import_batch', p_batch_id, 'BASELINES_COMMITTED',
    jsonb_build_object('count', imported_count));
  return imported_count;
end;
$$;
create or replace function public.approve_beerthip_baselines(p_batch_id uuid, p_review_note text)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.beerthip_import_batches%rowtype;
  source_row public.beerthip_import_rows%rowtype;
  suggestion_id_value uuid;
  approved_count integer := 0;
begin
  if nullif(btrim(p_review_note), '') is null then
    raise exception 'Physician review note is required' using errcode = '22023';
  end if;
  select * into target from public.beerthip_import_batches where id = p_batch_id for update;
  if not found or not public.can_review_baseline(target.organization_id) then
    raise exception 'Only an assigned occupational physician may approve these baselines' using errcode = '42501';
  end if;
  if target.status <> 'AWAITING_BASELINE_APPROVAL' then
    raise exception 'Batch is not awaiting baseline approval' using errcode = '23514';
  end if;
  for source_row in select * from public.beerthip_import_rows
    where batch_id = p_batch_id and exam_type = 'BASELINE' order by ordinal
  loop
    select id into suggestion_id_value from public.baseline_interpretation_suggestions
    where candidate_audiogram_id = source_row.audiogram_id
      and organization_id = target.organization_id
      and suggestion_type = 'THAI_INITIAL_BASELINE_CANDIDATE'
      and review_status in ('PENDING', 'DEFERRED')
    for update;
    if suggestion_id_value is null then
      raise exception 'Baseline suggestion unavailable for row %', source_row.ordinal;
    end if;
    perform public.review_baseline_suggestion(suggestion_id_value, 'APPROVE', btrim(p_review_note));
    approved_count := approved_count + 1;
  end loop;
  if approved_count <> target.file_count then
    raise exception 'Baseline approval count does not match source files';
  end if;
  update public.beerthip_import_batches set status = 'REMAINDER_READY' where id = p_batch_id;
  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (target.organization_id, auth.uid(), 'beerthip_import_batch', p_batch_id, 'BULK_BASELINES_APPROVED',
    jsonb_build_object('count', approved_count, 'reviewNote', btrim(p_review_note)));
  return approved_count;
end;
$$;
create or replace function public.commit_beerthip_remainder(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target public.beerthip_import_batches%rowtype;
  source_row public.beerthip_import_rows%rowtype;
  source_data jsonb;
  employee_record public.employees%rowtype;
  baseline_record public.hearing_baseline_history%rowtype;
  source_monitoring_id uuid;
  source_case_id uuid;
  audiogram_id_value uuid;
  thai_rule_id uuid;
  osha_rule_id uuid;
  thai_evaluation_id uuid;
  thai_status text;
  osha_status text;
  thai_snapshot jsonb;
  osha_snapshot jsonb;
  missing_count integer;
  osha_missing_count integer;
  imported_count integer := 0;
begin
  select * into target from public.beerthip_import_batches where id = p_batch_id for update;
  if not found or not public.can_manage_organization(target.organization_id) then
    raise exception 'Not authorized to commit Beerthip history' using errcode = '42501';
  end if;
  if target.status <> 'REMAINDER_READY' then
    raise exception 'All baselines require physician approval first' using errcode = '23514';
  end if;
  select id into thai_rule_id from public.rule_sets
    where code = 'THAI_HEARING_2561' and version = '1.0.0';
  select id into osha_rule_id from public.rule_sets
    where code = 'OSHA_STS_29_CFR_1910_95' and version = '0.1.0';
  if thai_rule_id is null or osha_rule_id is null then raise exception 'Rule metadata unavailable'; end if;

  for source_row in select * from public.beerthip_import_rows
    where batch_id = p_batch_id and exam_type <> 'BASELINE'
    order by employee_number, exam_date, case exam_type when 'ANNUAL' then 0 else 1 end, ordinal
  loop
    source_data := source_row.staged_data_json;
    select * into employee_record from public.employees
      where organization_id = target.organization_id and employee_number = source_row.employee_number;
    if not found then raise exception 'Employee unavailable for row %', source_row.ordinal; end if;
    select * into baseline_record from public.hearing_baseline_history
      where organization_id = target.organization_id and employee_id = employee_record.id
        and framework_or_context = 'THAI_OPERATIONAL' and ear_scope = 'BOTH' and status = 'ACTIVE';
    if not found or not exists (
      select 1 from public.audiograms
      where id = baseline_record.baseline_audiogram_id and beerthip_import_batch_id = p_batch_id
    ) then raise exception 'Approved source baseline unavailable for row %', source_row.ordinal; end if;
    if exists (select 1 from public.audiograms
      where employee_id = employee_record.id and exam_date = source_row.exam_date
        and exam_type = source_row.exam_type and record_status = 'FINAL') then
      raise exception 'Audiogram already exists for row %', source_row.ordinal;
    end if;

    source_monitoring_id := null;
    source_case_id := null;
    if source_row.exam_type = 'CONFIRMATION' then
      select candidate.audiogram_id into source_monitoring_id
      from public.beerthip_import_rows candidate
      where candidate.batch_id = p_batch_id
        and candidate.source_filename = source_row.source_filename
        and candidate.source_row = (source_data ->> 'sourceMonitoringRow')::integer
        and candidate.exam_type = 'ANNUAL';
      if source_monitoring_id is null then
        raise exception 'Monitoring link unavailable for Confirmed row %', source_row.ordinal;
      end if;
      select follow_up.id into source_case_id from public.follow_up_cases follow_up
      join public.surveillance_evaluations evaluation on evaluation.id = follow_up.trigger_evaluation_id
      where evaluation.current_audiogram_id = source_monitoring_id;
    end if;

    insert into public.audiograms (
      organization_id, employee_id, exam_date, exam_type, is_valid, validation_notes,
      record_status, finalized_at, finalized_by, beerthip_import_batch_id,
      source_provenance_json, source_monitoring_audiogram_id, follow_up_case_id
    ) values (
      target.organization_id, employee_record.id, source_row.exam_date, source_row.exam_type,
      true, 'Historical XLSX source; pretest and otoscopy evidence was not supplied.',
      'FINAL', timezone('utc', now()), auth.uid(), p_batch_id,
      source_data - 'observations' - 'thaiEvaluation' - 'oshaEvaluation',
      source_monitoring_id, source_case_id
    ) returning id into audiogram_id_value;

    insert into public.audiogram_thresholds (
      audiogram_id, ear, frequency_hz, response_status, threshold_db_hl, no_response_at_db_hl
    ) select audiogram_id_value, point ->> 'ear', (point ->> 'frequencyHz')::integer,
      point ->> 'responseStatus',
      case when point ->> 'responseStatus' = 'MEASURED' then (point ->> 'thresholdDbHl')::numeric else null end,
      case when point ->> 'responseStatus' = 'NO_RESPONSE' then (point ->> 'noResponseAtDbHl')::numeric else null end
    from jsonb_array_elements(source_data -> 'observations') point;
    if (select count(*) from public.audiogram_thresholds where audiogram_id = audiogram_id_value) <> 14 then
      raise exception 'Row % does not contain 14 threshold observations', source_row.ordinal;
    end if;

    select count(*) into missing_count from public.audiogram_thresholds
      where audiogram_id = audiogram_id_value and response_status <> 'MEASURED';
    thai_status := case when missing_count > 0 then 'NOT_EVALUABLE'
      when exists (
        select 1 from public.audiogram_thresholds current_point
        join public.audiogram_thresholds baseline_point
          on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
          and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
        where current_point.audiogram_id = audiogram_id_value
          and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15
      ) then 'POSITIVE' else 'NEGATIVE' end;
    select count(*) into osha_missing_count from public.audiogram_thresholds
      where audiogram_id = audiogram_id_value and frequency_hz in (2000, 3000, 4000)
        and response_status <> 'MEASURED';
    osha_status := case when osha_missing_count > 0 then 'NOT_EVALUABLE'
      when exists (
        select 1 from public.audiogram_thresholds current_point
        join public.audiogram_thresholds baseline_point
          on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
          and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
        where current_point.audiogram_id = audiogram_id_value and current_point.frequency_hz in (2000, 3000, 4000)
        group by current_point.ear
        having avg(current_point.threshold_db_hl - baseline_point.threshold_db_hl) >= 10
      ) then 'POSITIVE' else 'NEGATIVE' end;
    thai_snapshot := source_data -> 'thaiEvaluation';
    osha_snapshot := source_data -> 'oshaEvaluation';
    if upper(coalesce(thai_snapshot ->> 'status', '')) <> thai_status
      or upper(coalesce(osha_snapshot ->> 'status', '')) <> osha_status then
      raise exception 'Stored evaluation differs from rule result for row %', source_row.ordinal;
    end if;
    insert into public.surveillance_evaluations (
      organization_id, employee_id, current_audiogram_id, baseline_audiogram_id,
      baseline_history_id, rule_set_id, rule_version, status, evaluation_result_json, evaluated_at
    ) values (
      target.organization_id, employee_record.id, audiogram_id_value,
      baseline_record.baseline_audiogram_id, baseline_record.id,
      thai_rule_id, '1.0.0', thai_status, thai_snapshot,
      (thai_snapshot ->> 'evaluatedAt')::timestamptz
    ) returning id into thai_evaluation_id;
    insert into public.surveillance_evaluations (
      organization_id, employee_id, current_audiogram_id, baseline_audiogram_id,
      baseline_history_id, rule_set_id, rule_version, status, evaluation_result_json, evaluated_at
    ) values (
      target.organization_id, employee_record.id, audiogram_id_value,
      baseline_record.baseline_audiogram_id, baseline_record.id,
      osha_rule_id, '0.1.0', osha_status, osha_snapshot,
      (osha_snapshot ->> 'evaluatedAt')::timestamptz
    );
    if source_row.exam_type = 'ANNUAL' and thai_status = 'POSITIVE' then
      insert into public.follow_up_cases (
        organization_id, employee_id, trigger_evaluation_id, status,
        priority, detected_date, repeat_due_date
      ) values (
        target.organization_id, employee_record.id, thai_evaluation_id,
        'REPEAT_REQUIRED', 'NORMAL', source_row.exam_date, source_row.exam_date + 30
      );
    elsif source_row.exam_type = 'CONFIRMATION' and source_case_id is not null then
      update public.follow_up_cases set status = 'REPEAT_COMPLETED',
        repeat_completed_date = source_row.exam_date
      where id = source_case_id and status = 'REPEAT_REQUIRED';
    end if;
    update public.beerthip_import_rows set audiogram_id = audiogram_id_value where id = source_row.id;
    imported_count := imported_count + 1;
  end loop;
  if imported_count <> target.row_count - target.file_count then
    raise exception 'Remainder row count does not match staged batch';
  end if;
  update public.beerthip_import_batches set status = 'COMPLETED', completed_at = timezone('utc', now())
  where id = p_batch_id;
  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (target.organization_id, auth.uid(), 'beerthip_import_batch', p_batch_id, 'HISTORY_COMMITTED',
    jsonb_build_object('count', imported_count));
  return imported_count;
end;
$$;

-- 20261007030000_beerthip_remainder_qualified_monitoring_link.sql

-- Qualify the staged monitoring column in an already-installed routine.
-- Fresh databases may have the qualified definition from the preceding migration.
do $$
declare
  current_definition text;
  old_reference constant text := 'select audiogram_id into source_monitoring_id';
  new_reference constant text := 'select candidate.audiogram_id into source_monitoring_id';
begin
  select pg_get_functiondef('public.commit_beerthip_remainder(uuid)'::regprocedure)
    into current_definition;
  if position(new_reference in current_definition) > 0 then
    return;
  end if;
  if position(old_reference in current_definition) = 0 then
    raise exception 'Unexpected Beerthip remainder routine; review before patching';
  end if;
  execute replace(current_definition, old_reference, new_reference);
end;
$$;

-- 20261007040000_beerthip_missing_quiet_evidence_warning.sql


-- 20261007050000_beerthip_physician_file_review.sql

-- Historical Beerthip intake: original evidence is private, and only an assigned
-- occupational physician can turn one verified file into clinical records.
-- The ordinary paperless 14-hour pretest rule is intentionally unchanged.

drop function if exists public.commit_beerthip_baselines(uuid);
drop function if exists public.approve_beerthip_baselines(uuid, text);
drop function if exists public.commit_beerthip_remainder(uuid);
drop function if exists public.delete_staged_beerthip_batch(uuid);
alter table public.beerthip_import_batches drop constraint beerthip_import_batches_status_check;
alter table public.beerthip_import_batches add constraint beerthip_import_batches_status_check
  check (status in ('STAGED', 'PARTIALLY_IMPORTED', 'COMPLETED'));
drop policy beerthip_batches_read on public.beerthip_import_batches;
drop policy beerthip_rows_read on public.beerthip_import_rows;
create policy beerthip_batches_clinical_read on public.beerthip_import_batches
  for select to public using (
    public.can_manage_organization(organization_id) or public.can_review_baseline(organization_id)
  );
create policy beerthip_rows_clinical_read on public.beerthip_import_rows
  for select to public using (
    public.can_manage_organization(organization_id) or public.can_review_baseline(organization_id)
  );
-- No authenticated storage.objects policies: only the trusted server, after
-- checking the actor against this file's organization, handles originals.

create table public.beerthip_import_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.beerthip_import_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_filename text not null,
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  source_status text not null default 'PENDING' check (source_status in ('PENDING', 'VERIFIED', 'FAILED')),
  verified_sha256 text check (verified_sha256 is null or verified_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz,
  review_status text not null default 'PENDING' check (review_status in ('PENDING', 'DEFERRED', 'REJECTED', 'IMPORTED')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  warnings_acknowledged boolean not null default false,
  imported_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (batch_id, source_filename),
  check (source_status <> 'VERIFIED' or (verified_sha256 = expected_sha256 and verified_at is not null)),
  check (review_status <> 'IMPORTED' or (source_status = 'VERIFIED' and reviewed_by is not null and imported_at is not null))
);
create index beerthip_import_files_batch_idx on public.beerthip_import_files(batch_id, review_status);
create trigger beerthip_import_files_set_updated_at before update on public.beerthip_import_files
  for each row execute function public.set_updated_at();
alter table public.beerthip_import_files enable row level security;
create policy beerthip_files_clinical_read on public.beerthip_import_files
  for select to public using (
    public.can_manage_organization(organization_id) or public.can_review_baseline(organization_id)
  );
create or replace function public.seed_beerthip_import_file_records()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb;
begin
  for item in select * from jsonb_array_elements(new.source_files_json) loop
    if nullif(item ->> 'name', '') is null or (item ->> 'sha256') !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid Beerthip source file manifest' using errcode = '22023';
    end if;
    insert into public.beerthip_import_files (
      batch_id, organization_id, source_filename, expected_sha256, storage_path
    ) values (
      new.id, new.organization_id, item ->> 'name', item ->> 'sha256',
      new.id::text || '/' || gen_random_uuid()::text || '.xlsx'
    );
  end loop;
  return new;
end;
$$;
create trigger beerthip_batch_seed_file_records after insert on public.beerthip_import_batches
  for each row execute function public.seed_beerthip_import_file_records();
create or replace function public.review_beerthip_import_file(
  p_file_id uuid, p_decision text, p_review_note text, p_acknowledge_warnings boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  file_record public.beerthip_import_files%rowtype;
  batch_record public.beerthip_import_batches%rowtype;
  source_row public.beerthip_import_rows%rowtype;
  source_data jsonb;
  department_item jsonb;
  department_record public.departments%rowtype;
  employee_record public.employees%rowtype;
  baseline_record public.hearing_baseline_history%rowtype;
  baseline_row public.beerthip_import_rows%rowtype;
  audiogram_id_value uuid;
  baseline_id_value uuid;
  source_monitoring_id uuid;
  thai_rule_id uuid;
  osha_rule_id uuid;
  thai_evaluation_id uuid;
  thai_status text;
  osha_status text;
  missing_count integer;
  osha_missing_count integer;
  imported_count integer := 0;
  normalized_decision text := upper(btrim(p_decision));
  latest_monitoring_row uuid;
  latest_monitoring_evaluation uuid;
begin
  if normalized_decision not in ('APPROVE', 'REJECT', 'DEFER') then
    raise exception 'Invalid physician decision' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_review_note, ''))) < 10 or length(p_review_note) > 2000 then
    raise exception 'Physician reason must be 10-2000 characters' using errcode = '22023';
  end if;
  select * into file_record from public.beerthip_import_files where id = p_file_id for update;
  if not found then raise exception 'Import file unavailable' using errcode = 'P0002'; end if;
  select * into batch_record from public.beerthip_import_batches where id = file_record.batch_id for update;
  if not public.can_review_baseline(batch_record.organization_id)
    or file_record.organization_id <> batch_record.organization_id then
    raise exception 'Assigned occupational physician required' using errcode = '42501';
  end if;
  if file_record.review_status in ('IMPORTED', 'REJECTED') then
    raise exception 'File already has a final decision' using errcode = '23514';
  end if;
  if normalized_decision <> 'APPROVE' then
    update public.beerthip_import_files set review_status = case normalized_decision
      when 'REJECT' then 'REJECTED' else 'DEFERRED' end,
      reviewed_by = auth.uid(), reviewed_at = timezone('utc', now()),
      review_note = btrim(p_review_note), warnings_acknowledged = false
    where id = p_file_id;
    insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
    values (batch_record.organization_id, auth.uid(), 'beerthip_import_file', p_file_id,
      case normalized_decision when 'REJECT' then 'HISTORICAL_IMPORT_REJECTED' else 'HISTORICAL_IMPORT_DEFERRED' end,
      jsonb_build_object('reason', btrim(p_review_note), 'sourceSha256', file_record.expected_sha256));
    return jsonb_build_object('decision', normalized_decision, 'importedAudiograms', 0);
  end if;
  if not p_acknowledge_warnings then
    raise exception 'Physician must acknowledge all warnings' using errcode = '23514';
  end if;
  if batch_record.status not in ('STAGED', 'PARTIALLY_IMPORTED') then
    raise exception 'Batch is not open for review' using errcode = '23514';
  end if;
  if (select count(*) from public.beerthip_import_files where batch_id = batch_record.id and source_status = 'VERIFIED')
    <> batch_record.file_count then
    raise exception 'All original XLSX files must be verified before approval' using errcode = '23514';
  end if;
  if file_record.source_status <> 'VERIFIED' or file_record.verified_sha256 <> file_record.expected_sha256 then
    raise exception 'Original XLSX hash is not verified' using errcode = '23514';
  end if;
  if exists (select 1 from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and classification = 'ERROR') then
    raise exception 'Structural errors prevent approval' using errcode = '23514';
  end if;
  if (select count(*) from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and exam_type = 'BASELINE') <> 1 then
    raise exception 'Exactly one source baseline is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and audiogram_id is not null) then
    raise exception 'Some rows have already been imported' using errcode = '23514';
  end if;
  select * into baseline_row from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and exam_type = 'BASELINE';
  source_data := baseline_row.staged_data_json;
  select * into department_item from jsonb_array_elements(batch_record.department_proposals_json) item
    where item ->> 'name' = source_data ->> 'department' limit 1;
  if department_item is null then raise exception 'Department mapping unavailable'; end if;
  insert into public.departments (organization_id, code, name)
    values (batch_record.organization_id, department_item ->> 'code', department_item ->> 'name')
    on conflict (organization_id, code) do nothing;
  select * into department_record from public.departments where organization_id = batch_record.organization_id
    and code = department_item ->> 'code' and name = department_item ->> 'name';
  if not found then raise exception 'Department mapping conflicts with existing department'; end if;
  select * into employee_record from public.employees where organization_id = batch_record.organization_id
    and employee_number = baseline_row.employee_number for update;
  if found then
    if employee_record.first_name <> source_data ->> 'firstName'
      or employee_record.last_name <> source_data ->> 'lastName' then
      raise exception 'Employee identity conflicts with existing record';
    end if;
    if exists (select 1 from public.hearing_baseline_history where employee_id = employee_record.id
      and framework_or_context = 'THAI_OPERATIONAL' and status = 'ACTIVE') then
      raise exception 'Employee already has an active Thai operational baseline';
    end if;
  else
    insert into public.employees (organization_id, department_id, employee_number, first_name, last_name,
      sex, employment_start_date, active)
    values (batch_record.organization_id, department_record.id, baseline_row.employee_number,
      source_data ->> 'firstName', source_data ->> 'lastName', nullif(source_data ->> 'sex', ''),
      nullif(source_data ->> 'employmentStartDate', '')::date, true)
    returning * into employee_record;
  end if;
  select id into thai_rule_id from public.rule_sets where code = 'THAI_HEARING_2561' and version = '1.0.0';
  select id into osha_rule_id from public.rule_sets where code = 'OSHA_STS_29_CFR_1910_95' and version = '0.1.0';
  if thai_rule_id is null or osha_rule_id is null then raise exception 'Rule metadata unavailable'; end if;

  for source_row in select * from public.beerthip_import_rows
    where batch_id = batch_record.id and source_filename = file_record.source_filename
    order by exam_date, case exam_type when 'BASELINE' then 0 when 'ANNUAL' then 1 else 2 end, source_row
  loop
    source_data := source_row.staged_data_json;
    if exists (select 1 from public.audiograms where employee_id = employee_record.id
      and exam_date = source_row.exam_date and exam_type = source_row.exam_type) then
      raise exception 'Employee already has this audiogram (% / %)', source_row.exam_date, source_row.exam_type;
    end if;
    source_monitoring_id := null;
    if source_row.exam_type = 'CONFIRMATION' then
      select candidate.audiogram_id into source_monitoring_id from public.beerthip_import_rows candidate
      where candidate.batch_id = batch_record.id and candidate.source_filename = file_record.source_filename
        and candidate.source_row = (source_data ->> 'sourceMonitoringRow')::integer
        and candidate.exam_type = 'ANNUAL';
      if source_monitoring_id is null then raise exception 'Confirmed result has no imported Monitoring link'; end if;
    end if;
    insert into public.audiograms (organization_id, employee_id, exam_date, exam_type,
      is_valid, validation_notes, record_status, finalized_at, finalized_by,
      beerthip_import_batch_id, source_provenance_json, source_monitoring_audiogram_id)
    values (batch_record.organization_id, employee_record.id, source_row.exam_date, source_row.exam_type,
      true, 'Historical XLSX: pretest/otoscopy and 14-hour quiet evidence not documented in source.',
      'FINAL', timezone('utc', now()), auth.uid(), batch_record.id,
      (source_data - 'observations' - 'thaiEvaluation' - 'oshaEvaluation') ||
        jsonb_build_object('sourceFileId', file_record.id, 'sourceSha256', file_record.expected_sha256,
          'historicalImport', true, 'quietPeriodEvidence', 'NOT_DOCUMENTED',
          'physicianId', auth.uid(), 'physicianDecisionAt', timezone('utc', now()),
          'physicianReason', btrim(p_review_note)), source_monitoring_id)
    returning id into audiogram_id_value;
    insert into public.audiogram_thresholds (audiogram_id, ear, frequency_hz, response_status,
      threshold_db_hl, no_response_at_db_hl)
    select audiogram_id_value, point ->> 'ear', (point ->> 'frequencyHz')::integer,
      point ->> 'responseStatus',
      case when point ->> 'responseStatus' = 'MEASURED' then (point ->> 'thresholdDbHl')::numeric else null end,
      case when point ->> 'responseStatus' = 'NO_RESPONSE' then (point ->> 'noResponseAtDbHl')::numeric else null end
    from jsonb_array_elements(source_data -> 'observations') point;
    if (select count(*) from public.audiogram_thresholds where audiogram_id = audiogram_id_value) <> 14 then
      raise exception 'Source row does not contain 14 audiometric points';
    end if;
    insert into public.audiogram_pretest_assessments (audiogram_id, organization_id, employee_id,
      quiet_period_answer, general_notes)
    values (audiogram_id_value, batch_record.organization_id, employee_record.id, 'UNKNOWN',
      'Historical XLSX: evidence of 14-hour quiet period was not supplied; physician decision is not proof of quiet period.');
    update public.beerthip_import_rows set audiogram_id = audiogram_id_value where id = source_row.id;
    imported_count := imported_count + 1;
    if source_row.exam_type = 'BASELINE' then
      if exists (select 1 from public.audiogram_thresholds where audiogram_id = audiogram_id_value
        and response_status <> 'MEASURED') then raise exception 'Baseline must contain 14 measured points'; end if;
      insert into public.hearing_baseline_history (organization_id, employee_id, baseline_audiogram_id,
        ear_scope, framework_or_context, status, reason_code, reason_text,
        approved_by, approved_at, effective_from)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value, 'BOTH',
        'THAI_OPERATIONAL', 'ACTIVE', 'HISTORICAL_PHYSICIAN_APPROVED', btrim(p_review_note),
        auth.uid(), timezone('utc', now()), source_row.exam_date)
      returning * into baseline_record;
    else
      if baseline_record.id is null then raise exception 'Baseline must precede historical results'; end if;
      select count(*) into missing_count from public.audiogram_thresholds
        where audiogram_id = audiogram_id_value and response_status <> 'MEASURED';
      thai_status := case when missing_count > 0 then 'NOT_EVALUABLE'
        when exists (select 1 from public.audiogram_thresholds current_point
          join public.audiogram_thresholds baseline_point on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
            and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
          where current_point.audiogram_id = audiogram_id_value
            and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15)
          then 'POSITIVE' else 'NEGATIVE' end;
      select count(*) into osha_missing_count from public.audiogram_thresholds
        where audiogram_id = audiogram_id_value and frequency_hz in (2000,3000,4000)
          and response_status <> 'MEASURED';
      osha_status := case when osha_missing_count > 0 then 'NOT_EVALUABLE'
        when exists (select 1 from public.audiogram_thresholds current_point
          join public.audiogram_thresholds baseline_point on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
            and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
          where current_point.audiogram_id = audiogram_id_value and current_point.frequency_hz in (2000,3000,4000)
          group by current_point.ear having avg(current_point.threshold_db_hl - baseline_point.threshold_db_hl) >= 10)
          then 'POSITIVE' else 'NEGATIVE' end;
      if upper(coalesce(source_data #>> '{thaiEvaluation,status}', '')) <> thai_status
        or upper(coalesce(source_data #>> '{oshaEvaluation,status}', '')) <> osha_status then
        raise exception 'Staged rule result differs from database calculation';
      end if;
      insert into public.surveillance_evaluations (organization_id, employee_id, current_audiogram_id,
        baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
        status, evaluation_result_json, evaluated_at)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value,
        baseline_record.baseline_audiogram_id, baseline_record.id, thai_rule_id, '1.0.0',
        thai_status, source_data -> 'thaiEvaluation',
        (source_data #>> '{thaiEvaluation,evaluatedAt}')::timestamptz)
      returning id into thai_evaluation_id;
      insert into public.surveillance_evaluations (organization_id, employee_id, current_audiogram_id,
        baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
        status, evaluation_result_json, evaluated_at)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value,
        baseline_record.baseline_audiogram_id, baseline_record.id, osha_rule_id, '0.1.0',
        osha_status, source_data -> 'oshaEvaluation',
        (source_data #>> '{oshaEvaluation,evaluatedAt}')::timestamptz);
      if source_row.exam_type = 'ANNUAL' then
        latest_monitoring_row := source_row.id;
        latest_monitoring_evaluation := case when thai_status = 'POSITIVE' then thai_evaluation_id else null end;
      end if;
    end if;
  end loop;
  if latest_monitoring_evaluation is not null and not exists (
    select 1 from public.beerthip_import_rows confirmed
    join public.beerthip_import_rows monitoring on monitoring.id = latest_monitoring_row
    where confirmed.batch_id = batch_record.id and confirmed.source_filename = file_record.source_filename
      and confirmed.exam_type = 'CONFIRMATION' and confirmed.exam_date >= monitoring.exam_date
      and (confirmed.staged_data_json ->> 'sourceMonitoringRow')::integer = monitoring.source_row
  ) then
    insert into public.follow_up_cases (organization_id, employee_id, trigger_evaluation_id,
      status, priority, detected_date, repeat_due_date, intervention_notes)
    select batch_record.organization_id, employee_record.id, latest_monitoring_evaluation,
      'REPEAT_REQUIRED', 'NORMAL', monitoring.exam_date, monitoring.exam_date + 30,
      'Historical import; source examination and original repeat due date retained.'
    from public.beerthip_import_rows monitoring where monitoring.id = latest_monitoring_row;
  end if;
  update public.beerthip_import_files set review_status = 'IMPORTED', reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()), review_note = btrim(p_review_note),
    warnings_acknowledged = true, imported_at = timezone('utc', now()) where id = p_file_id;
  update public.beerthip_import_batches set status = case when
    (select count(*) from public.beerthip_import_files where batch_id = batch_record.id and review_status = 'IMPORTED')
      = batch_record.file_count then 'COMPLETED' else 'PARTIALLY_IMPORTED' end,
    completed_at = case when (select count(*) from public.beerthip_import_files
      where batch_id = batch_record.id and review_status = 'IMPORTED') = batch_record.file_count
      then timezone('utc', now()) else null end
    where id = batch_record.id;
  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (batch_record.organization_id, auth.uid(), 'beerthip_import_file', p_file_id,
    'HISTORICAL_IMPORT_APPROVED', jsonb_build_object('reason', btrim(p_review_note),
      'warningsAcknowledged', true, 'sourceSha256', file_record.expected_sha256,
      'quietPeriodEvidence', 'NOT_DOCUMENTED', 'importedAudiograms', imported_count));
  return jsonb_build_object('decision', 'APPROVE', 'importedAudiograms', imported_count);
end;
$$;

-- 20261007060000_beerthip_historical_case_badge.sql

-- Append a durable historical-source flag without changing queue columns used
-- by existing consumers. The trigger audiogram is immutable when Final.
create or replace view public.follow_up_queue
with (security_invoker = true)
as
select
  follow_up.id,
  follow_up.organization_id,
  follow_up.employee_id,
  follow_up.trigger_evaluation_id,
  evaluation.current_audiogram_id,
  employee.employee_number,
  employee.first_name,
  employee.last_name,
  organization.name as organization_name,
  department.name as department_name,
  rule_set.code as rule_code,
  rule_set.name as rule_name,
  evaluation.rule_version,
  evaluation.status as evaluation_status,
  evaluation.evaluation_result_json,
  evaluation.evaluated_at,
  follow_up.status,
  follow_up.priority,
  follow_up.detected_date,
  follow_up.repeat_due_date,
  follow_up.repeat_completed_date,
  follow_up.physician_review_date,
  follow_up.intervention_required,
  follow_up.intervention_notes,
  follow_up.follow_up_date,
  follow_up.closed_date,
  follow_up.assigned_to,
  follow_up.created_at,
  follow_up.updated_at,
  (
    follow_up.status in ('SHIFT_DETECTED', 'REPEAT_REQUIRED')
    and follow_up.repeat_due_date < current_date
  ) as is_overdue,
  (audiogram.beerthip_import_batch_id is not null) as historical_import
from public.follow_up_cases follow_up
join public.employees employee on employee.id = follow_up.employee_id
join public.organizations organization on organization.id = follow_up.organization_id
left join public.departments department on department.id = employee.department_id
join public.surveillance_evaluations evaluation on evaluation.id = follow_up.trigger_evaluation_id
join public.audiograms audiogram on audiogram.id = evaluation.current_audiogram_id
join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
 and rule_set.version = evaluation.rule_version;

-- 20261007070000_dual_role_physician_audit.sql

-- A local pilot account can hold both hospital-admin and Beerthip physician
-- access. Its historical clinical decisions must be attributed to the
-- physician role; unrelated administrator events keep the existing priority.
create or replace function public.attribute_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.actor_email := coalesce(new.actor_email, nullif(auth.jwt() ->> 'email', ''));

  if new.actor_role is null and auth.uid() is not null then
    if new.action in (
      'HISTORICAL_IMPORT_APPROVED',
      'HISTORICAL_IMPORT_REJECTED',
      'HISTORICAL_IMPORT_DEFERRED'
    ) and public.can_review_baseline(new.organization_id) then
      new.actor_role := 'OCCUPATIONAL_PHYSICIAN';
    else
      select access.role into new.actor_role
      from public.user_organization_access access
      where access.user_id = auth.uid()
        and access.active
        and (access.role = 'HOSPITAL_ADMIN' or access.organization_id = new.organization_id)
      order by case access.role
        when 'HOSPITAL_ADMIN' then 1
        when 'OCCUPATIONAL_PHYSICIAN' then 2
        when 'OCCUPATIONAL_HEALTH_STAFF' then 3
        else 4
      end
      limit 1;
    end if;
  end if;

  return new;
end;
$$;

-- 20261007080000_beerthip_optional_physician_reason.sql

-- A Beerthip physician may leave the decision note blank. Keep every other
-- per-file clinical import gate and the all-or-nothing transaction unchanged.
create or replace function public.review_beerthip_import_file(
  p_file_id uuid, p_decision text, p_review_note text, p_acknowledge_warnings boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  file_record public.beerthip_import_files%rowtype;
  batch_record public.beerthip_import_batches%rowtype;
  source_row public.beerthip_import_rows%rowtype;
  source_data jsonb;
  department_item jsonb;
  department_record public.departments%rowtype;
  employee_record public.employees%rowtype;
  baseline_record public.hearing_baseline_history%rowtype;
  baseline_row public.beerthip_import_rows%rowtype;
  audiogram_id_value uuid;
  baseline_id_value uuid;
  source_monitoring_id uuid;
  thai_rule_id uuid;
  osha_rule_id uuid;
  thai_evaluation_id uuid;
  thai_status text;
  osha_status text;
  missing_count integer;
  osha_missing_count integer;
  imported_count integer := 0;
  normalized_decision text := upper(btrim(p_decision));
  normalized_note text := nullif(btrim(p_review_note, E' \t\n\r\f\v'), '');
  latest_monitoring_row uuid;
  latest_monitoring_evaluation uuid;
begin
  if normalized_decision not in ('APPROVE', 'REJECT', 'DEFER') then
    raise exception 'Invalid physician decision' using errcode = '22023';
  end if;
  if normalized_note is not null and (length(normalized_note) < 10 or length(normalized_note) > 2000) then
    raise exception 'Physician reason, if supplied, must be 10-2000 characters' using errcode = '22023';
  end if;
  select * into file_record from public.beerthip_import_files where id = p_file_id for update;
  if not found then raise exception 'Import file unavailable' using errcode = 'P0002'; end if;
  select * into batch_record from public.beerthip_import_batches where id = file_record.batch_id for update;
  if not public.can_review_baseline(batch_record.organization_id)
    or file_record.organization_id <> batch_record.organization_id then
    raise exception 'Assigned occupational physician required' using errcode = '42501';
  end if;
  if file_record.review_status in ('IMPORTED', 'REJECTED') then
    raise exception 'File already has a final decision' using errcode = '23514';
  end if;
  if normalized_decision <> 'APPROVE' then
    update public.beerthip_import_files set review_status = case normalized_decision
      when 'REJECT' then 'REJECTED' else 'DEFERRED' end,
      reviewed_by = auth.uid(), reviewed_at = timezone('utc', now()),
      review_note = normalized_note, warnings_acknowledged = false
    where id = p_file_id;
    insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
    values (batch_record.organization_id, auth.uid(), 'beerthip_import_file', p_file_id,
      case normalized_decision when 'REJECT' then 'HISTORICAL_IMPORT_REJECTED' else 'HISTORICAL_IMPORT_DEFERRED' end,
      jsonb_build_object('reason', normalized_note, 'sourceSha256', file_record.expected_sha256));
    return jsonb_build_object('decision', normalized_decision, 'importedAudiograms', 0);
  end if;
  if not p_acknowledge_warnings then
    raise exception 'Physician must acknowledge all warnings' using errcode = '23514';
  end if;
  if batch_record.status not in ('STAGED', 'PARTIALLY_IMPORTED') then
    raise exception 'Batch is not open for review' using errcode = '23514';
  end if;
  if (select count(*) from public.beerthip_import_files where batch_id = batch_record.id and source_status = 'VERIFIED')
    <> batch_record.file_count then
    raise exception 'All original XLSX files must be verified before approval' using errcode = '23514';
  end if;
  if file_record.source_status <> 'VERIFIED' or file_record.verified_sha256 <> file_record.expected_sha256 then
    raise exception 'Original XLSX hash is not verified' using errcode = '23514';
  end if;
  if exists (select 1 from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and classification = 'ERROR') then
    raise exception 'Structural errors prevent approval' using errcode = '23514';
  end if;
  if (select count(*) from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and exam_type = 'BASELINE') <> 1 then
    raise exception 'Exactly one source baseline is required' using errcode = '23514';
  end if;
  if exists (select 1 from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and audiogram_id is not null) then
    raise exception 'Some rows have already been imported' using errcode = '23514';
  end if;
  select * into baseline_row from public.beerthip_import_rows where batch_id = batch_record.id
    and source_filename = file_record.source_filename and exam_type = 'BASELINE';
  source_data := baseline_row.staged_data_json;
  select * into department_item from jsonb_array_elements(batch_record.department_proposals_json) item
    where item ->> 'name' = source_data ->> 'department' limit 1;
  if department_item is null then raise exception 'Department mapping unavailable'; end if;
  insert into public.departments (organization_id, code, name)
    values (batch_record.organization_id, department_item ->> 'code', department_item ->> 'name')
    on conflict (organization_id, code) do nothing;
  select * into department_record from public.departments where organization_id = batch_record.organization_id
    and code = department_item ->> 'code' and name = department_item ->> 'name';
  if not found then raise exception 'Department mapping conflicts with existing department'; end if;
  select * into employee_record from public.employees where organization_id = batch_record.organization_id
    and employee_number = baseline_row.employee_number for update;
  if found then
    if employee_record.first_name <> source_data ->> 'firstName'
      or employee_record.last_name <> source_data ->> 'lastName' then
      raise exception 'Employee identity conflicts with existing record';
    end if;
    if exists (select 1 from public.hearing_baseline_history where employee_id = employee_record.id
      and framework_or_context = 'THAI_OPERATIONAL' and status = 'ACTIVE') then
      raise exception 'Employee already has an active Thai operational baseline';
    end if;
  else
    insert into public.employees (organization_id, department_id, employee_number, first_name, last_name,
      sex, employment_start_date, active)
    values (batch_record.organization_id, department_record.id, baseline_row.employee_number,
      source_data ->> 'firstName', source_data ->> 'lastName', nullif(source_data ->> 'sex', ''),
      nullif(source_data ->> 'employmentStartDate', '')::date, true)
    returning * into employee_record;
  end if;
  select id into thai_rule_id from public.rule_sets where code = 'THAI_HEARING_2561' and version = '1.0.0';
  select id into osha_rule_id from public.rule_sets where code = 'OSHA_STS_29_CFR_1910_95' and version = '0.1.0';
  if thai_rule_id is null or osha_rule_id is null then raise exception 'Rule metadata unavailable'; end if;

  for source_row in select * from public.beerthip_import_rows
    where batch_id = batch_record.id and source_filename = file_record.source_filename
    order by exam_date, case exam_type when 'BASELINE' then 0 when 'ANNUAL' then 1 else 2 end, source_row
  loop
    source_data := source_row.staged_data_json;
    if exists (select 1 from public.audiograms where employee_id = employee_record.id
      and exam_date = source_row.exam_date and exam_type = source_row.exam_type) then
      raise exception 'Employee already has this audiogram (% / %)', source_row.exam_date, source_row.exam_type;
    end if;
    source_monitoring_id := null;
    if source_row.exam_type = 'CONFIRMATION' then
      select candidate.audiogram_id into source_monitoring_id from public.beerthip_import_rows candidate
      where candidate.batch_id = batch_record.id and candidate.source_filename = file_record.source_filename
        and candidate.source_row = (source_data ->> 'sourceMonitoringRow')::integer
        and candidate.exam_type = 'ANNUAL';
      if source_monitoring_id is null then raise exception 'Confirmed result has no imported Monitoring link'; end if;
    end if;
    insert into public.audiograms (organization_id, employee_id, exam_date, exam_type,
      is_valid, validation_notes, record_status, finalized_at, finalized_by,
      beerthip_import_batch_id, source_provenance_json, source_monitoring_audiogram_id)
    values (batch_record.organization_id, employee_record.id, source_row.exam_date, source_row.exam_type,
      true, 'Historical XLSX: pretest/otoscopy and 14-hour quiet evidence not documented in source.',
      'FINAL', timezone('utc', now()), auth.uid(), batch_record.id,
      (source_data - 'observations' - 'thaiEvaluation' - 'oshaEvaluation') ||
        jsonb_build_object('sourceFileId', file_record.id, 'sourceSha256', file_record.expected_sha256,
          'historicalImport', true, 'quietPeriodEvidence', 'NOT_DOCUMENTED',
          'physicianId', auth.uid(), 'physicianDecisionAt', timezone('utc', now()),
          'physicianReason', normalized_note), source_monitoring_id)
    returning id into audiogram_id_value;
    insert into public.audiogram_thresholds (audiogram_id, ear, frequency_hz, response_status,
      threshold_db_hl, no_response_at_db_hl)
    select audiogram_id_value, point ->> 'ear', (point ->> 'frequencyHz')::integer,
      point ->> 'responseStatus',
      case when point ->> 'responseStatus' = 'MEASURED' then (point ->> 'thresholdDbHl')::numeric else null end,
      case when point ->> 'responseStatus' = 'NO_RESPONSE' then (point ->> 'noResponseAtDbHl')::numeric else null end
    from jsonb_array_elements(source_data -> 'observations') point;
    if (select count(*) from public.audiogram_thresholds where audiogram_id = audiogram_id_value) <> 14 then
      raise exception 'Source row does not contain 14 audiometric points';
    end if;
    insert into public.audiogram_pretest_assessments (audiogram_id, organization_id, employee_id,
      quiet_period_answer, general_notes)
    values (audiogram_id_value, batch_record.organization_id, employee_record.id, 'UNKNOWN',
      'Historical XLSX: evidence of 14-hour quiet period was not supplied; physician decision is not proof of quiet period.');
    update public.beerthip_import_rows set audiogram_id = audiogram_id_value where id = source_row.id;
    imported_count := imported_count + 1;
    if source_row.exam_type = 'BASELINE' then
      if exists (select 1 from public.audiogram_thresholds where audiogram_id = audiogram_id_value
        and response_status <> 'MEASURED') then raise exception 'Baseline must contain 14 measured points'; end if;
      insert into public.hearing_baseline_history (organization_id, employee_id, baseline_audiogram_id,
        ear_scope, framework_or_context, status, reason_code, reason_text,
        approved_by, approved_at, effective_from)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value, 'BOTH',
        'THAI_OPERATIONAL', 'ACTIVE', 'HISTORICAL_PHYSICIAN_APPROVED', normalized_note,
        auth.uid(), timezone('utc', now()), source_row.exam_date)
      returning * into baseline_record;
    else
      if baseline_record.id is null then raise exception 'Baseline must precede historical results'; end if;
      select count(*) into missing_count from public.audiogram_thresholds
        where audiogram_id = audiogram_id_value and response_status <> 'MEASURED';
      thai_status := case when missing_count > 0 then 'NOT_EVALUABLE'
        when exists (select 1 from public.audiogram_thresholds current_point
          join public.audiogram_thresholds baseline_point on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
            and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
          where current_point.audiogram_id = audiogram_id_value
            and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15)
          then 'POSITIVE' else 'NEGATIVE' end;
      select count(*) into osha_missing_count from public.audiogram_thresholds
        where audiogram_id = audiogram_id_value and frequency_hz in (2000,3000,4000)
          and response_status <> 'MEASURED';
      osha_status := case when osha_missing_count > 0 then 'NOT_EVALUABLE'
        when exists (select 1 from public.audiogram_thresholds current_point
          join public.audiogram_thresholds baseline_point on baseline_point.audiogram_id = baseline_record.baseline_audiogram_id
            and baseline_point.ear = current_point.ear and baseline_point.frequency_hz = current_point.frequency_hz
          where current_point.audiogram_id = audiogram_id_value and current_point.frequency_hz in (2000,3000,4000)
          group by current_point.ear having avg(current_point.threshold_db_hl - baseline_point.threshold_db_hl) >= 10)
          then 'POSITIVE' else 'NEGATIVE' end;
      if upper(coalesce(source_data #>> '{thaiEvaluation,status}', '')) <> thai_status
        or upper(coalesce(source_data #>> '{oshaEvaluation,status}', '')) <> osha_status then
        raise exception 'Staged rule result differs from database calculation';
      end if;
      insert into public.surveillance_evaluations (organization_id, employee_id, current_audiogram_id,
        baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
        status, evaluation_result_json, evaluated_at)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value,
        baseline_record.baseline_audiogram_id, baseline_record.id, thai_rule_id, '1.0.0',
        thai_status, source_data -> 'thaiEvaluation',
        (source_data #>> '{thaiEvaluation,evaluatedAt}')::timestamptz)
      returning id into thai_evaluation_id;
      insert into public.surveillance_evaluations (organization_id, employee_id, current_audiogram_id,
        baseline_audiogram_id, baseline_history_id, rule_set_id, rule_version,
        status, evaluation_result_json, evaluated_at)
      values (batch_record.organization_id, employee_record.id, audiogram_id_value,
        baseline_record.baseline_audiogram_id, baseline_record.id, osha_rule_id, '0.1.0',
        osha_status, source_data -> 'oshaEvaluation',
        (source_data #>> '{oshaEvaluation,evaluatedAt}')::timestamptz);
      if source_row.exam_type = 'ANNUAL' then
        latest_monitoring_row := source_row.id;
        latest_monitoring_evaluation := case when thai_status = 'POSITIVE' then thai_evaluation_id else null end;
      end if;
    end if;
  end loop;
  if latest_monitoring_evaluation is not null and not exists (
    select 1 from public.beerthip_import_rows confirmed
    join public.beerthip_import_rows monitoring on monitoring.id = latest_monitoring_row
    where confirmed.batch_id = batch_record.id and confirmed.source_filename = file_record.source_filename
      and confirmed.exam_type = 'CONFIRMATION' and confirmed.exam_date >= monitoring.exam_date
      and (confirmed.staged_data_json ->> 'sourceMonitoringRow')::integer = monitoring.source_row
  ) then
    insert into public.follow_up_cases (organization_id, employee_id, trigger_evaluation_id,
      status, priority, detected_date, repeat_due_date, intervention_notes)
    select batch_record.organization_id, employee_record.id, latest_monitoring_evaluation,
      'REPEAT_REQUIRED', 'NORMAL', monitoring.exam_date, monitoring.exam_date + 30,
      'Historical import; source examination and original repeat due date retained.'
    from public.beerthip_import_rows monitoring where monitoring.id = latest_monitoring_row;
  end if;
  update public.beerthip_import_files set review_status = 'IMPORTED', reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()), review_note = normalized_note,
    warnings_acknowledged = true, imported_at = timezone('utc', now()) where id = p_file_id;
  update public.beerthip_import_batches set status = case when
    (select count(*) from public.beerthip_import_files where batch_id = batch_record.id and review_status = 'IMPORTED')
      = batch_record.file_count then 'COMPLETED' else 'PARTIALLY_IMPORTED' end,
    completed_at = case when (select count(*) from public.beerthip_import_files
      where batch_id = batch_record.id and review_status = 'IMPORTED') = batch_record.file_count
      then timezone('utc', now()) else null end
    where id = batch_record.id;
  insert into public.audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values_json)
  values (batch_record.organization_id, auth.uid(), 'beerthip_import_file', p_file_id,
    'HISTORICAL_IMPORT_APPROVED', jsonb_build_object('reason', normalized_note,
      'warningsAcknowledged', true, 'sourceSha256', file_record.expected_sha256,
      'quietPeriodEvidence', 'NOT_DOCUMENTED', 'importedAudiograms', imported_count));
  return jsonb_build_object('decision', 'APPROVE', 'importedAudiograms', imported_count);
end;
$$;

-- 20261010000000_thai_hearing_2561_v2.sql

-- Thai operational shift compares the six frequencies defined for the
-- baseline in clause 5. The 8000 Hz observation remains in the audiogram and
-- other analyses, but cannot trigger this rule or make it not evaluable.
insert into public.rule_sets (
  code, name, version, jurisdiction, effective_date, status,
  reference_title, reference_url, notes, configuration_json
) values (
  'THAI_HEARING_2561', 'Thai Hearing Surveillance Rule 2561', '2.0.0',
  'Thailand', '2018-06-13', 'ACTIVE',
  'ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง หลักเกณฑ์และวิธีการจัดทำมาตรการอนุรักษ์การได้ยินในสถานประกอบกิจการ พ.ศ. 2561 ข้อ 5–6',
  'https://osh.labour.go.th/wp-content/uploads/2026/02/hear-2561.pdf',
  'Interpretation of clauses 5–6: compare only the six baseline frequencies. Clinical and local policy review remains required.',
  '{"ears":["LEFT","RIGHT"],"comparison":"CURRENT_MINUS_OPERATIONAL_BASELINE","frequenciesHz":[500,1000,2000,3000,4000,6000],"repeatDueDays":30,"thresholdShiftDb":15}'::jsonb
) on conflict (code, version) do nothing;
-- A database guard covers Beerthip, CSV, paperless and any future writer.
create or replace function public.enforce_thai_hearing_v2_evaluation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  rule_code text;
  expected_status text;
  missing_points integer;
begin
  select code into rule_code from public.rule_sets where id = new.rule_set_id;
  if rule_code <> 'THAI_HEARING_2561' then return new; end if;

  if new.rule_version <> '2.0.0' then
    raise exception 'New Thai operational evaluations must use rule v2.0.0' using errcode = '23514';
  end if;
  if coalesce(new.evaluation_result_json ->> 'ruleCode', '') <> rule_code
    or coalesce(new.evaluation_result_json ->> 'ruleVersion', '') <> new.rule_version
    or upper(coalesce(new.evaluation_result_json ->> 'status', '')) <> new.status then
    raise exception 'Thai evaluation snapshot metadata differs from persisted row' using errcode = '23514';
  end if;
  if coalesce(jsonb_typeof(new.evaluation_result_json -> 'triggeredFindings'), '') <> 'array'
    or exists (
      select 1 from jsonb_array_elements(new.evaluation_result_json -> 'triggeredFindings') finding
      where (finding ->> 'frequencyHz')::integer not in (500,1000,2000,3000,4000,6000)
    ) then
    raise exception 'Thai v2 findings must use eligible frequencies' using errcode = '23514';
  end if;

  if new.baseline_audiogram_id is null then
    expected_status := 'NOT_EVALUABLE';
  else
    select count(*) into missing_points
    from (values ('LEFT'), ('RIGHT')) ears(ear)
    cross join (values (500),(1000),(2000),(3000),(4000),(6000)) frequencies(hz)
    left join public.audiogram_thresholds current_point
      on current_point.audiogram_id = new.current_audiogram_id
      and current_point.ear = ears.ear and current_point.frequency_hz = frequencies.hz
    left join public.audiogram_thresholds baseline_point
      on baseline_point.audiogram_id = new.baseline_audiogram_id
      and baseline_point.ear = ears.ear and baseline_point.frequency_hz = frequencies.hz
    where current_point.response_status is distinct from 'MEASURED'
       or baseline_point.response_status is distinct from 'MEASURED';
    expected_status := case when missing_points > 0 then 'NOT_EVALUABLE'
      when exists (
        select 1 from public.audiogram_thresholds current_point
        join public.audiogram_thresholds baseline_point
          on baseline_point.audiogram_id = new.baseline_audiogram_id
          and baseline_point.ear = current_point.ear
          and baseline_point.frequency_hz = current_point.frequency_hz
        where current_point.audiogram_id = new.current_audiogram_id
          and current_point.frequency_hz in (500,1000,2000,3000,4000,6000)
          and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15
      ) then 'POSITIVE' else 'NEGATIVE' end;
  end if;
  if new.status <> expected_status then
    raise exception 'Thai v2 status differs from six-frequency database calculation' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger surveillance_evaluations_enforce_thai_v2
before insert on public.surveillance_evaluations
for each row execute function public.enforce_thai_hearing_v2_evaluation();
-- Keep the existing physician/transaction logic intact while replacing the
-- precise rule calculation and requiring a freshly staged v2 snapshot.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.review_beerthip_import_file(uuid,text,text,boolean)'::regprocedure);
  if position('version = ''1.0.0''' in definition) = 0
    or position('thai_rule_id, ''1.0.0''' in definition) = 0
    or position('select count(*) into missing_count from public.audiogram_thresholds' in definition) = 0 then
    raise exception 'Beerthip review function differs from expected source; refuse rule upgrade';
  end if;
  definition := replace(definition, 'version = ''1.0.0''', 'version = ''2.0.0''');
  definition := replace(definition, 'thai_rule_id, ''1.0.0''', 'thai_rule_id, ''2.0.0''');
  definition := replace(definition,
    E'where audiogram_id = audiogram_id_value and response_status <> ''MEASURED'';\n      thai_status',
    E'where audiogram_id = audiogram_id_value and frequency_hz in (500,1000,2000,3000,4000,6000) and response_status <> ''MEASURED'';\n      thai_status');
  definition := replace(definition,
    E'where current_point.audiogram_id = audiogram_id_value\n            and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15)',
    E'where current_point.audiogram_id = audiogram_id_value\n            and current_point.frequency_hz in (500,1000,2000,3000,4000,6000)\n            and current_point.threshold_db_hl - baseline_point.threshold_db_hl >= 15)');
  definition := replace(definition,
    'if upper(coalesce(source_data #>> ''{thaiEvaluation,status}'', '''')) <> thai_status',
    E'if coalesce(source_data #>> ''{thaiEvaluation,ruleVersion}'', '''') <> ''2.0.0''\n        or upper(coalesce(source_data #>> ''{thaiEvaluation,status}'', '''')) <> thai_status');
  if position('frequency_hz in (500,1000,2000,3000,4000,6000) and response_status' in definition) = 0
    or position('and current_point.frequency_hz in (500,1000,2000,3000,4000,6000)' in definition) = 0
    or position('source_data #>> ''{thaiEvaluation,ruleVersion}''' in definition) = 0 then
    raise exception 'Beerthip six-frequency replacements did not apply';
  end if;
  execute definition;
end;
$$;
-- The public CSV RPC delegates to this internal function. Reject old staged
-- snapshots instead of relabelling a v1 calculation as v2.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.commit_import_batch_internal(uuid)'::regprocedure);
  if position('version = ''1.0.0''' in definition) = 0
    or position('if thai_status not in' in definition) = 0 then
    raise exception 'CSV import function differs from expected source; refuse rule upgrade';
  end if;
  definition := replace(definition, 'version = ''1.0.0''', 'version = ''2.0.0''');
  definition := replace(definition, 'if thai_status not in',
    E'if coalesce(normalized #>> ''{thaiEvaluation,ruleVersion}'', '''') <> ''2.0.0''\n        or thai_status not in');
  execute definition;
end;
$$;
create or replace view public.employee_directory with (security_invoker = true) as
select employee.id, employee.organization_id, employee.department_id,
  employee.employee_number, employee.first_name, employee.last_name,
  employee.job_title, employee.active, organization.name as organization_name,
  organization.code as organization_code, department.name as department_name,
  latest_audiogram.exam_date as latest_audiogram_date,
  latest_evaluation.status as latest_evaluation_status,
  latest_case.status as follow_up_status, latest_case.repeat_due_date,
  case when latest_case.status is not null then latest_case.status
    when latest_evaluation.status = 'POSITIVE' then 'SHIFT_DETECTED'
    when latest_evaluation.status = 'NOT_EVALUABLE' then 'NOT_EVALUABLE'
    else 'STABLE' end as surveillance_status
from public.employees employee
join public.organizations organization on organization.id = employee.organization_id
left join public.departments department on department.id = employee.department_id
left join lateral (
  select audiogram.exam_date from public.audiograms audiogram
  where audiogram.employee_id = employee.id and audiogram.is_valid
  order by audiogram.exam_date desc, audiogram.created_at desc limit 1
) latest_audiogram on true
left join lateral (
  select evaluation.status from public.surveillance_evaluations evaluation
  join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
    and rule_set.version = evaluation.rule_version
  join public.audiograms current_audiogram on current_audiogram.id = evaluation.current_audiogram_id
  where evaluation.employee_id = employee.id and rule_set.code = 'THAI_HEARING_2561'
  order by current_audiogram.exam_date desc, current_audiogram.examined_at desc,
    evaluation.evaluated_at desc, evaluation.created_at desc limit 1
) latest_evaluation on true
left join lateral (
  select follow_up.status, follow_up.repeat_due_date from public.follow_up_cases follow_up
  where follow_up.employee_id = employee.id
  order by case when follow_up.status = 'CLOSED' then 1 else 0 end,
    follow_up.updated_at desc limit 1
) latest_case on true;
create or replace view public.employee_population_surveillance with (security_invoker = true) as
select employee.id as employee_id, employee.organization_id, employee.department_id,
  employee.employee_number, employee.first_name, employee.last_name, employee.job_title,
  organization.code as organization_code, organization.name as organization_name,
  organization.name_th as organization_name_th, department.code as department_code,
  department.name as department_name,
  extract(year from current_date)::integer as surveillance_year,
  annual_audiogram.exam_date as annual_audiogram_date,
  annual_audiogram.exam_date is not null as annual_audiometry_completed,
  thai_evaluation.status as thai_evaluation_status,
  exists (select 1 from public.noise_exposures exposure
    where exposure.organization_id = employee.organization_id
      and (exposure.employee_id = employee.id or
        (exposure.employee_id is null and employee.department_id is not null
          and exposure.department_id = employee.department_id))) as linked_noise_exposure,
  latest_case.status as follow_up_status, latest_case.repeat_due_date,
  (latest_case.status in ('SHIFT_DETECTED','REPEAT_REQUIRED')
    and latest_case.repeat_due_date < current_date) as repeat_overdue
from public.employees employee
join public.organizations organization on organization.id = employee.organization_id
left join public.departments department on department.id = employee.department_id
left join lateral (
  select audiogram.exam_date from public.audiograms audiogram
  where audiogram.employee_id = employee.id and audiogram.exam_type = 'ANNUAL'
    and audiogram.is_valid and extract(year from audiogram.exam_date) = extract(year from current_date)
  order by audiogram.exam_date desc, audiogram.created_at desc limit 1
) annual_audiogram on true
left join lateral (
  select evaluation.status from public.surveillance_evaluations evaluation
  join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
    and rule_set.version = evaluation.rule_version
  join public.audiograms current_audiogram on current_audiogram.id = evaluation.current_audiogram_id
  where evaluation.employee_id = employee.id and rule_set.code = 'THAI_HEARING_2561'
    and extract(year from current_audiogram.exam_date) = extract(year from current_date)
  order by current_audiogram.exam_date desc, current_audiogram.examined_at desc,
    evaluation.evaluated_at desc, evaluation.created_at desc limit 1
) thai_evaluation on true
left join lateral (
  select follow_up.status, follow_up.repeat_due_date from public.follow_up_cases follow_up
  where follow_up.employee_id = employee.id
  order by case when follow_up.status = 'CLOSED' then 1 else 0 end,
    follow_up.updated_at desc limit 1
) latest_case on true
where employee.active;
create or replace view public.follow_up_queue with (security_invoker = true) as
select follow_up.id, follow_up.organization_id, follow_up.employee_id,
  follow_up.trigger_evaluation_id, evaluation.current_audiogram_id,
  employee.employee_number, employee.first_name, employee.last_name,
  organization.name as organization_name, department.name as department_name,
  rule_set.code as rule_code, rule_set.name as rule_name,
  evaluation.rule_version, evaluation.status as evaluation_status,
  evaluation.evaluation_result_json, evaluation.evaluated_at,
  follow_up.status, follow_up.priority, follow_up.detected_date,
  follow_up.repeat_due_date, follow_up.repeat_completed_date,
  follow_up.physician_review_date, follow_up.intervention_required,
  follow_up.intervention_notes, follow_up.follow_up_date, follow_up.closed_date,
  follow_up.assigned_to, follow_up.created_at, follow_up.updated_at,
  (follow_up.status in ('SHIFT_DETECTED','REPEAT_REQUIRED')
    and follow_up.repeat_due_date < current_date) as is_overdue,
  (audiogram.beerthip_import_batch_id is not null) as historical_import
from public.follow_up_cases follow_up
join public.employees employee on employee.id = follow_up.employee_id
join public.organizations organization on organization.id = follow_up.organization_id
left join public.departments department on department.id = employee.department_id
join public.surveillance_evaluations trigger_evaluation
  on trigger_evaluation.id = follow_up.trigger_evaluation_id
join public.audiograms audiogram on audiogram.id = trigger_evaluation.current_audiogram_id
join lateral (
  select candidate.* from public.surveillance_evaluations candidate
  join public.rule_sets candidate_rule on candidate_rule.id = candidate.rule_set_id
  where candidate.current_audiogram_id = trigger_evaluation.current_audiogram_id
    and candidate_rule.code = 'THAI_HEARING_2561'
  order by candidate.evaluated_at desc, candidate.created_at desc limit 1
) evaluation on true
join public.rule_sets rule_set on rule_set.id = evaluation.rule_set_id
  and rule_set.version = evaluation.rule_version;

-- 20261010020000_retire_thai_hearing_v1.sql

-- Keep v1 and its 319 historical evaluations readable, but remove the
-- superseded seven-frequency implementation from the active rule catalog.
update public.rule_sets
set status = 'RETIRED'
where code = 'THAI_HEARING_2561' and version = '1.0.0' and status = 'ACTIVE';

-- 20261013000000_employee_scoped_nihl.sql

-- Keep existing HN-scoped NIHL records intact while allowing a clearly limited
-- employee-scoped review when a verified hospital HN has not been linked.
alter table public.patient_noise_exposure_periods
  alter column patient_id drop not null;
alter table public.patient_noise_exposure_periods
  add constraint patient_noise_period_identity_required
  check (patient_id is not null or employee_id is not null);
create index patient_noise_periods_unlinked_employee_idx
  on public.patient_noise_exposure_periods (employee_id, start_date)
  where patient_id is null;
alter table public.nihl_evidence_assessments
  alter column patient_id drop not null;
alter table public.nihl_evidence_assessments
  add constraint nihl_employee_scope_partial
  check (patient_id is not null or (
    coalesce(evidence_json ->> 'identityScope', '') = 'EMPLOYEE_ONLY'
    and completeness = 'PARTIAL'
  ));
insert into public.rule_sets (
  code, name, version, jurisdiction, effective_date, status,
  reference_title, reference_url, notes, configuration_json
)
select code, name, '1.1.0', jurisdiction, date '2026-10-13', status,
  reference_title, reference_url,
  notes || ' Employee-only identity scope is explicitly partial until a verified HN is linked.',
  configuration_json || '{"employeeOnlyScope":true}'::jsonb
from public.rule_sets
where code = 'NIHL_EVIDENCE_PROFILE' and version = '1.0.0'
on conflict (code, version) do nothing;
create or replace function public.save_employee_noise_exposure_period(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  period_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  saved public.patient_noise_exposure_periods%rowtype;
  source jsonb;
  protection jsonb;
  linked_noise_id uuid;
begin
  select * into target_employee from public.employees
  where id = (p_payload ->> 'employeeId')::uuid for update;
  if target_employee.id is null or target_employee.patient_id is not null
    or not public.is_hospital_clinical_user()
    or not public.can_manage_organization(target_employee.organization_id)
  then
    raise exception 'Employee NIHL exposure is outside the actor scope' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload -> 'sources') is distinct from 'array' then
    raise exception 'At least one exposure source is required' using errcode = '23514';
  end if;
  if jsonb_array_length(p_payload -> 'sources') < 1 then
    raise exception 'At least one exposure source is required' using errcode = '23514';
  end if;

  if period_id is null then
    insert into public.patient_noise_exposure_periods (
      patient_id, organization_id, employee_id, employer_name, job_title,
      start_date, end_date, hours_per_day, days_per_week, weeks_per_year,
      exposure_pattern, impulse_noise, information_source, confidence, notes,
      status, status_reason, created_by, updated_by
    ) values (
      null, target_employee.organization_id, target_employee.id,
      btrim(p_payload ->> 'employerName'), nullif(btrim(p_payload ->> 'jobTitle'), ''),
      (p_payload ->> 'startDate')::date, nullif(p_payload ->> 'endDate', '')::date,
      nullif(p_payload ->> 'hoursPerDay', '')::numeric,
      nullif(p_payload ->> 'daysPerWeek', '')::numeric,
      nullif(p_payload ->> 'weeksPerYear', '')::numeric,
      p_payload ->> 'exposurePattern', coalesce((p_payload ->> 'impulseNoise')::boolean, false),
      p_payload ->> 'informationSource', p_payload ->> 'confidence',
      nullif(btrim(p_payload ->> 'notes'), ''), coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE'),
      nullif(btrim(p_payload ->> 'statusReason'), ''), auth.uid(), auth.uid()
    ) returning * into saved;
  else
    update public.patient_noise_exposure_periods
    set employer_name = btrim(p_payload ->> 'employerName'),
        job_title = nullif(btrim(p_payload ->> 'jobTitle'), ''),
        start_date = (p_payload ->> 'startDate')::date,
        end_date = nullif(p_payload ->> 'endDate', '')::date,
        hours_per_day = nullif(p_payload ->> 'hoursPerDay', '')::numeric,
        days_per_week = nullif(p_payload ->> 'daysPerWeek', '')::numeric,
        weeks_per_year = nullif(p_payload ->> 'weeksPerYear', '')::numeric,
        exposure_pattern = p_payload ->> 'exposurePattern',
        impulse_noise = coalesce((p_payload ->> 'impulseNoise')::boolean, false),
        information_source = p_payload ->> 'informationSource',
        confidence = p_payload ->> 'confidence',
        notes = nullif(btrim(p_payload ->> 'notes'), ''),
        status = coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE'),
        status_reason = nullif(btrim(p_payload ->> 'statusReason'), ''),
        updated_by = auth.uid()
    where id = period_id and patient_id is null
      and employee_id = target_employee.id
      and organization_id = target_employee.organization_id
    returning * into saved;
    if saved.id is null then
      raise exception 'Employee exposure period is not in this organization scope' using errcode = 'P0002';
    end if;
    delete from public.patient_noise_exposure_sources where exposure_period_id = saved.id;
    delete from public.patient_hearing_protection_periods where exposure_period_id = saved.id;
  end if;

  for source in select value from jsonb_array_elements(p_payload -> 'sources') loop
    linked_noise_id := nullif(source ->> 'noiseExposureId', '')::uuid;
    if linked_noise_id is not null and not exists (
      select 1 from public.noise_exposures
      where id = linked_noise_id and organization_id = target_employee.organization_id
    ) then
      raise exception 'Noise measurement is outside the employee organization' using errcode = '42501';
    end if;
    insert into public.patient_noise_exposure_sources (
      exposure_period_id, noise_exposure_id, measurement_kind, metric,
      level_db_a, dose_percent, measurement_duration_hours, exchange_rate_db,
      criterion_level_db_a, measurement_date, representative_from,
      representative_to, quality, notes, verified_by, verified_at
    ) values (
      saved.id, linked_noise_id, source ->> 'measurementKind', source ->> 'metric',
      nullif(source ->> 'levelDbA', '')::numeric,
      nullif(source ->> 'dosePercent', '')::numeric,
      nullif(source ->> 'measurementDurationHours', '')::numeric,
      nullif(source ->> 'exchangeRateDb', '')::numeric,
      nullif(source ->> 'criterionLevelDbA', '')::numeric,
      nullif(source ->> 'measurementDate', '')::date,
      nullif(source ->> 'representativeFrom', '')::date,
      nullif(source ->> 'representativeTo', '')::date,
      source ->> 'quality', nullif(btrim(source ->> 'notes'), ''),
      case when coalesce((source ->> 'verified')::boolean, false) then auth.uid() else null end,
      case when coalesce((source ->> 'verified')::boolean, false) then timezone('utc', now()) else null end
    );
  end loop;

  for protection in select value from jsonb_array_elements(coalesce(p_payload -> 'hearingProtection', '[]'::jsonb)) loop
    insert into public.patient_hearing_protection_periods (
      exposure_period_id, start_date, end_date, protection_type,
      wearing_time_percent, attenuation_method, attenuation_db, fit_test_date, notes
    ) values (
      saved.id, nullif(protection ->> 'startDate', '')::date,
      nullif(protection ->> 'endDate', '')::date,
      btrim(protection ->> 'protectionType'),
      nullif(protection ->> 'wearingTimePercent', '')::numeric,
      protection ->> 'attenuationMethod',
      nullif(protection ->> 'attenuationDb', '')::numeric,
      nullif(protection ->> 'fitTestDate', '')::date,
      nullif(btrim(protection ->> 'notes'), '')
    );
  end loop;

  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (target_employee.organization_id, 'patient_noise_exposure_period', saved.id,
    case when period_id is null then 'EMPLOYEE_NOISE_EXPOSURE_RECORDED' else 'EMPLOYEE_NOISE_EXPOSURE_UPDATED' end,
    jsonb_build_object('employeeId', target_employee.id, 'identityScope', 'EMPLOYEE_ONLY',
      'status', saved.status, 'sourceCount', jsonb_array_length(p_payload -> 'sources')));
  return saved.id;
end;
$$;
create or replace function public.persist_employee_nihl_evidence_assessment(
  p_employee_id uuid,
  p_current_audiogram_id uuid,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_employee public.employees%rowtype;
  target_audiogram public.audiograms%rowtype;
  selected_rule public.rule_sets%rowtype;
  previous public.nihl_evidence_assessments%rowtype;
  saved_id uuid;
begin
  select * into target_employee from public.employees where id = p_employee_id for update;
  select * into target_audiogram from public.audiograms where id = p_current_audiogram_id;
  select * into selected_rule from public.rule_sets
    where code = 'NIHL_EVIDENCE_PROFILE' and version = '1.1.0';
  if target_employee.id is null or target_employee.patient_id is not null
    or target_audiogram.id is null or target_audiogram.employee_id <> target_employee.id
    or target_audiogram.organization_id <> target_employee.organization_id
    or target_audiogram.record_status <> 'FINAL' or not target_audiogram.is_valid
    or selected_rule.id is null
    or not public.is_hospital_clinical_user()
    or not public.can_access_organization(target_employee.organization_id)
  then
    raise exception 'Employee NIHL assessment is invalid or outside the actor scope' using errcode = '42501';
  end if;
  if coalesce(p_result ->> 'ruleCode', '') <> 'NIHL_EVIDENCE_PROFILE'
    or coalesce(p_result ->> 'ruleVersion', '') <> '1.1.0'
    or coalesce(p_result ->> 'identityScope', '') <> 'EMPLOYEE_ONLY'
    or coalesce(p_result ->> 'completeness', '') <> 'PARTIAL'
    or coalesce((p_result ->> 'nonDiagnostic')::boolean, false) is not true
    or coalesce((p_result ->> 'automaticDiagnosis')::boolean, false)
    or coalesce((p_result ->> 'automaticBaselineChange')::boolean, false)
    or coalesce((p_result ->> 'thaiFollowUpMutation')::boolean, false)
  then
    raise exception 'Employee NIHL assessment must be partial and non-diagnostic' using errcode = '23514';
  end if;

  select * into previous from public.nihl_evidence_assessments
  where current_audiogram_id = p_current_audiogram_id and record_status = 'CURRENT'
  for update;
  if previous.id is not null and previous.evidence_json = p_result then
    return previous.id;
  end if;
  if previous.id is not null then
    update public.nihl_evidence_assessments set record_status = 'SUPERSEDED'
    where id = previous.id;
  end if;
  insert into public.nihl_evidence_assessments (
    patient_id, organization_id, employee_id, current_audiogram_id,
    rule_set_id, rule_version, qualitative_state, completeness,
    evidence_json, explanation, supersedes_assessment_id, created_by
  ) values (
    null, target_employee.organization_id, target_employee.id,
    target_audiogram.id, selected_rule.id, '1.1.0',
    p_result ->> 'state', 'PARTIAL', p_result,
    p_result ->> 'explanation', previous.id, auth.uid()
  ) returning id into saved_id;
  if previous.id is not null then
    update public.nihl_evidence_assessments set superseded_by_assessment_id = saved_id
    where id = previous.id;
  end if;
  insert into public.audit_logs (organization_id, entity_type, entity_id, action, new_values_json)
  values (target_employee.organization_id, 'nihl_evidence_assessment', saved_id,
    'NIHL_EVIDENCE_ASSESSMENT_CREATED',
    jsonb_build_object('employeeId', target_employee.id,
      'audiogramId', target_audiogram.id, 'identityScope', 'EMPLOYEE_ONLY',
      'state', p_result ->> 'state', 'nonDiagnostic', true,
      'supersedesAssessmentId', previous.id));
  return saved_id;
end;
$$;

-- 20261013010000_nihl_physician_audit.sql

-- A dual-role hospital admin may sign NIHL interpretation only through a
-- physician assignment for the assessment organization. Attribute that
-- decision to the physician role, without relabeling administrative actions.
create or replace function public.attribute_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  new.user_id := coalesce(new.user_id, auth.uid());
  new.actor_email := coalesce(new.actor_email, nullif(auth.jwt() ->> 'email', ''));

  if new.actor_role is null and auth.uid() is not null then
    if new.action in (
      'HISTORICAL_IMPORT_APPROVED',
      'HISTORICAL_IMPORT_REJECTED',
      'HISTORICAL_IMPORT_DEFERRED',
      'NIHL_PHYSICIAN_REVIEW_RECORDED'
    ) and public.can_review_baseline(new.organization_id) then
      new.actor_role := 'OCCUPATIONAL_PHYSICIAN';
    else
      select access.role into new.actor_role
      from public.user_organization_access access
      where access.user_id = auth.uid()
        and access.active
        and (access.role = 'HOSPITAL_ADMIN' or access.organization_id = new.organization_id)
      order by case access.role
        when 'HOSPITAL_ADMIN' then 1
        when 'OCCUPATIONAL_PHYSICIAN' then 2
        when 'OCCUPATIONAL_HEALTH_STAFF' then 3
        else 4
      end
      limit 1;
    end if;
  end if;

  return new;
end;
$$;

-- 20261013020000_nihl_scope_consistency.sql

-- Reject misleading 1.1.0 snapshots even when a client calls the older
-- HN-scoped RPC directly. Existing 1.0.0 snapshots retain their original JSON.
alter table public.nihl_evidence_assessments
  add constraint nihl_v11_identity_scope_consistent check (
    rule_version <> '1.1.0'
    or (
      patient_id is null
      and coalesce(evidence_json ->> 'identityScope', '') = 'EMPLOYEE_ONLY'
      and completeness = 'PARTIAL'
    )
    or (
      patient_id is not null
      and coalesce(evidence_json ->> 'identityScope', '') = 'HN_LINKED'
    )
  );

-- 20261023000000_nihl_review_amendments.sql

-- Keep the current one-to-one review projection while retaining every signed
-- version behind clinical RLS. General audit readers must never receive notes.
alter table public.nihl_physician_reviews
  add column revision integer not null default 1 check (revision > 0),
  add column amended_at timestamptz;
create table public.nihl_physician_review_revisions (
  review_id uuid not null references public.nihl_physician_reviews(id) on delete restrict,
  revision integer not null check (revision > 0),
  decision text not null check (decision in (
    'AGREE_COMPATIBLE', 'MIXED_OR_MULTIFACTORIAL',
    'ALTERNATIVE_CAUSE_MORE_LIKELY', 'DEFER_NEED_MORE_DATA'
  )),
  review_note text not null check (nullif(btrim(review_note), '') is not null),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null,
  primary key (review_id, revision)
);
alter table public.nihl_physician_review_revisions enable row level security;
create policy nihl_review_revisions_clinical_read
on public.nihl_physician_review_revisions for select to public
using (public.is_hospital_clinical_user() and exists (
  select 1 from public.nihl_physician_reviews review
  where review.id = review_id and public.can_access_organization(review.organization_id)
));
create function public.capture_initial_nihl_review_revision()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.nihl_physician_review_revisions
    (review_id, revision, decision, review_note, recorded_by, recorded_at)
  values (new.id, 1, new.decision, new.review_note, new.reviewed_by, new.reviewed_at);
  return new;
end;
$$;
create trigger nihl_review_initial_revision
after insert on public.nihl_physician_reviews
for each row execute function public.capture_initial_nihl_review_revision();
create function public.amend_nihl_physician_review(
  p_review_id uuid, p_employee_id uuid, p_expected_revision integer,
  p_decision text, p_review_note text
)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_assessment_id uuid;
  assessment public.nihl_evidence_assessments%rowtype;
  review public.nihl_physician_reviews%rowtype;
  amendment_time timestamptz := clock_timestamp();
begin
  select assessment_id into target_assessment_id from public.nihl_physician_reviews where id = p_review_id;
  -- Lock in the same order as snapshot replacement, so an amendment cannot
  -- race a refresh that supersedes the assessment.
  select * into assessment from public.nihl_evidence_assessments
    where id = target_assessment_id for update;
  select * into review from public.nihl_physician_reviews where id = p_review_id for update;
  if auth.uid() is null or review.id is null or assessment.id is null
    or assessment.employee_id is distinct from p_employee_id
    or assessment.organization_id is distinct from review.organization_id
    or assessment.record_status <> 'CURRENT'
    or review.reviewed_by is distinct from auth.uid()
    or not public.can_review_baseline(assessment.organization_id)
  then
    raise exception 'Only the original assigned physician may amend a current review' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from review.revision then
    raise exception 'NIHL review revision changed; reload before saving' using errcode = '40001';
  end if;
  if p_decision is null or p_decision not in (
      'AGREE_COMPATIBLE', 'MIXED_OR_MULTIFACTORIAL',
      'ALTERNATIVE_CAUSE_MORE_LIKELY', 'DEFER_NEED_MORE_DATA')
    or nullif(btrim(p_review_note), '') is null or char_length(btrim(p_review_note)) > 4000
  then
    raise exception 'A valid interpretation and review note of 1 to 4000 characters are required' using errcode = '23514';
  end if;
  if review.decision = p_decision and review.review_note = btrim(p_review_note) then
    return jsonb_build_object('reviewId', review.id, 'audiogramId', assessment.current_audiogram_id, 'revision', review.revision);
  end if;
  insert into public.nihl_physician_review_revisions
    (review_id, revision, decision, review_note, recorded_by, recorded_at)
  values (review.id, review.revision + 1, p_decision, btrim(p_review_note), auth.uid(), amendment_time);
  update public.nihl_physician_reviews
    set decision = p_decision, review_note = btrim(p_review_note),
        revision = review.revision + 1, amended_at = amendment_time
    where id = review.id;
  insert into public.audit_logs
    (organization_id, entity_type, entity_id, action, actor_role, old_values_json, new_values_json)
  values (review.organization_id, 'nihl_physician_review', review.id,
    'NIHL_PHYSICIAN_REVIEW_AMENDED', 'OCCUPATIONAL_PHYSICIAN',
    jsonb_build_object('revision', review.revision),
    jsonb_build_object('revision', review.revision + 1, 'assessmentId', assessment.id,
      'employeeId', assessment.employee_id, 'audiogramId', assessment.current_audiogram_id,
      'changesDiagnosis', false, 'changesBaseline', false, 'changesThaiFollowUp', false));
  return jsonb_build_object('reviewId', review.id, 'audiogramId', assessment.current_audiogram_id, 'revision', review.revision + 1);
end;
$$;

-- 20261023010000_nihl_review_conflict_response.sql

-- Optimistic edit conflicts are business errors, not transaction serialization
-- failures. PostgREST retries 40001 transactions, so return a tagged P0001 instead.
create or replace function public.amend_nihl_physician_review(
  p_review_id uuid, p_employee_id uuid, p_expected_revision integer,
  p_decision text, p_review_note text
)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  target_assessment_id uuid;
  assessment public.nihl_evidence_assessments%rowtype;
  review public.nihl_physician_reviews%rowtype;
  amendment_time timestamptz := clock_timestamp();
begin
  select assessment_id into target_assessment_id from public.nihl_physician_reviews where id = p_review_id;
  -- Lock in the same order as snapshot replacement, so an amendment cannot
  -- race a refresh that supersedes the assessment.
  select * into assessment from public.nihl_evidence_assessments
    where id = target_assessment_id for update;
  select * into review from public.nihl_physician_reviews where id = p_review_id for update;
  if auth.uid() is null or review.id is null or assessment.id is null
    or assessment.employee_id is distinct from p_employee_id
    or assessment.organization_id is distinct from review.organization_id
    or assessment.record_status <> 'CURRENT'
    or review.reviewed_by is distinct from auth.uid()
    or not public.can_review_baseline(assessment.organization_id)
  then
    raise exception 'Only the original assigned physician may amend a current review' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from review.revision then
    raise exception 'NIHL_REVIEW_CONFLICT: reload before saving' using errcode = 'P0001';
  end if;
  if p_decision is null or p_decision not in (
      'AGREE_COMPATIBLE', 'MIXED_OR_MULTIFACTORIAL',
      'ALTERNATIVE_CAUSE_MORE_LIKELY', 'DEFER_NEED_MORE_DATA')
    or nullif(btrim(p_review_note), '') is null or char_length(btrim(p_review_note)) > 4000
  then
    raise exception 'A valid interpretation and review note of 1 to 4000 characters are required' using errcode = '23514';
  end if;
  if review.decision = p_decision and review.review_note = btrim(p_review_note) then
    return jsonb_build_object('reviewId', review.id, 'audiogramId', assessment.current_audiogram_id, 'revision', review.revision);
  end if;
  insert into public.nihl_physician_review_revisions
    (review_id, revision, decision, review_note, recorded_by, recorded_at)
  values (review.id, review.revision + 1, p_decision, btrim(p_review_note), auth.uid(), amendment_time);
  update public.nihl_physician_reviews
    set decision = p_decision, review_note = btrim(p_review_note),
        revision = review.revision + 1, amended_at = amendment_time
    where id = review.id;
  insert into public.audit_logs
    (organization_id, entity_type, entity_id, action, actor_role, old_values_json, new_values_json)
  values (review.organization_id, 'nihl_physician_review', review.id,
    'NIHL_PHYSICIAN_REVIEW_AMENDED', 'OCCUPATIONAL_PHYSICIAN',
    jsonb_build_object('revision', review.revision),
    jsonb_build_object('revision', review.revision + 1, 'assessmentId', assessment.id,
      'employeeId', assessment.employee_id, 'audiogramId', assessment.current_audiogram_id,
      'changesDiagnosis', false, 'changesBaseline', false, 'changesThaiFollowUp', false));
  return jsonb_build_object('reviewId', review.id, 'audiogramId', assessment.current_audiogram_id, 'revision', review.revision + 1);
end;
$$;

-- Native authentication and durable private originals.
create table hearguard_auth.sessions (
 token_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index sessions_user on hearguard_auth.sessions(user_id);
create table hearguard_auth.login_throttles (
 identifier_hash text primary key, failures integer not null default 0,
 window_start timestamptz not null default now()
);
create table hearguard_auth.private_files (
 file_id uuid primary key references public.beerthip_import_files(id) on delete cascade,
 storage_path text not null unique, content bytea not null,
 sha256 text not null check(length(sha256)=64), content_type text not null,
 updated_at timestamptz not null default now(), check(octet_length(content)<=6291456)
);
alter table hearguard_auth.private_files enable row level security;
alter table hearguard_auth.private_files force row level security;
create policy private_files_read on hearguard_auth.private_files for select using (
 exists(select 1 from public.beerthip_import_files f where f.id=file_id
 and (public.can_manage_organization(f.organization_id) or public.can_review_baseline(f.organization_id)))
);
create policy private_files_write on hearguard_auth.private_files for all using (
 exists(select 1 from public.beerthip_import_files f where f.id=file_id
 and f.review_status<>'IMPORTED' and public.can_manage_organization(f.organization_id))
) with check (
 exists(select 1 from public.beerthip_import_files f where f.id=file_id
 and f.review_status<>'IMPORTED' and public.can_manage_organization(f.organization_id))
);
create policy beerthip_file_source_update on public.beerthip_import_files for update using (
 review_status<>'IMPORTED' and public.can_manage_organization(organization_id)
) with check (review_status<>'IMPORTED' and public.can_manage_organization(organization_id));
create policy bms_trigger_audit_insert on public.audit_logs for insert with check (
 pg_trigger_depth()>0 and auth.uid() is not null and public.can_manage_organization(organization_id)
);

-- The BMS database owner is the only SQL connection identity. FORCE RLS is
-- mandatory because an owner otherwise bypasses policies. Request identity is
-- set with SET LOCAL inside each server transaction, never accepted from HTTP.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
   execute format('alter table public.%I enable row level security',t.tablename);
   execute format('alter table public.%I force row level security',t.tablename);
   execute format('create policy bms_trusted_command on public.%I for all using (auth.role()=''service_role'' or current_setting(''hearguard.command'',true)=''on'') with check (auth.role()=''service_role'' or current_setting(''hearguard.command'',true)=''on'')',t.tablename);
 end loop;
end $$;
revoke all on schema auth,hearguard_auth,extensions from public;
revoke all on all tables in schema public,auth,hearguard_auth from public;
revoke all on all sequences in schema public,auth,hearguard_auth from public;
revoke execute on all functions in schema public,auth from public;

