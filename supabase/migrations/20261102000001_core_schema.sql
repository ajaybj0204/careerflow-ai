-- CareerFlow AI core schema.
-- Runs unchanged on Supabase and on the local PGlite database (which gets a small auth shim first).
-- Every user-owned table has user_id + Row Level Security limiting rows to auth.uid().

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Provenance of a career fact. Only user_verified facts are treated as true by AI features.
-- document_extracted / ai_suggested / unverified must be confirmed by the user first.
-- hypothetical marks practice examples that must never become personal facts.

-- ---------------------------------------------------------------------------
-- Identity and profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  user_type text not null default 'experienced' check (user_type in ('fresher','experienced','switcher')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.career_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  headline text,
  summary text,
  location text,
  phone text,
  years_experience numeric(4,1),
  current_ctc_lpa numeric(8,2),
  expected_ctc_min_lpa numeric(8,2),
  expected_ctc_max_lpa numeric(8,2),
  notice_period_days int,
  target_roles text[] not null default '{}',
  avoid_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  work_modes text[] not null default '{}',
  career_goals text,
  linkedin_url text,
  github_url text,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_prefs jsonb not null default '{}'::jsonb,
  alert_frequency text not null default 'daily' check (alert_frequency in ('off','instant','daily','weekly')),
  ai_processing_consent boolean not null default false,
  transcript_consent boolean not null default false,
  email_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Shared columns for verifiable career facts
create table public.employment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  title text not null,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  bullets text[] not null default '{}',
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  source_document_id uuid,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution text not null,
  degree text,
  field text,
  start_year int,
  end_year int,
  grade text,
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verified_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  level text check (level in ('beginner','intermediate','advanced','expert')),
  years numeric(4,1),
  evidence text,
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index verified_skills_user_name_uq on public.verified_skills (user_id, lower(name));

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  issuer text,
  issued_on date,
  credential_url text,
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  url text,
  repo_url text,
  tech text[] not null default '{}',
  highlights text[] not null default '{}',
  -- Only completed projects are used as experience in resumes and answers.
  status text not null default 'completed' check (status in ('completed','in_progress','idea')),
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  source_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verified_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  metric text,
  employment_id uuid references public.employment_history(id) on delete set null,
  project_id uuid references public.portfolio_projects(id) on delete set null,
  source text not null default 'user_verified' check (source in ('user_verified','document_extracted','ai_suggested','hypothetical','unverified')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Job sources and listings
-- ---------------------------------------------------------------------------
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  -- null user_id = built-in portal visible to everyone; otherwise a user's custom portal
  user_id uuid references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  url text not null,
  category text not null default 'general',
  description text,
  best_for text[] not null default '{}',
  -- {q} and {l} are replaced with URL-encoded keywords and location; {qs}/{ls} with slug-style values
  search_url_template text,
  created_at timestamptz not null default now()
);
create unique index job_sources_slug_uq on public.job_sources (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

create table public.portal_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.job_sources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.job_sources(id) on delete set null,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text,
  title text not null,
  company text,
  location text,
  work_mode text check (work_mode in ('remote','hybrid','onsite','unknown')),
  experience_min numeric(4,1),
  experience_max numeric(4,1),
  salary_min_lpa numeric(8,2),
  salary_max_lpa numeric(8,2),
  salary_text text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  url text not null,
  description text,
  tags text[] not null default '{}',
  match_score int,
  match_reasons jsonb,
  dedupe_key text not null,
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index job_listings_dedupe_uq on public.job_listings (user_id, dedupe_key);

create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  keywords text not null,
  location text,
  frequency text not null default 'daily' check (frequency in ('instant','daily','weekly')),
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recruiters and companies
-- ---------------------------------------------------------------------------
create table public.recruiter_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  company text,
  email text,
  phone text,
  linkedin_url text,
  title text,
  notes text,
  source text not null default 'manual' check (source in ('manual','gmail','extension')),
  last_contacted_at timestamptz,
  next_followup_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index recruiter_contacts_email_uq on public.recruiter_contacts (user_id, lower(email)) where email is not null;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  domain text,
  website text,
  industry text,
  summary text,
  products text,
  interview_topics text[] not null default '{}',
  sources jsonb not null default '[]'::jsonb,
  notes text,
  researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_name_uq on public.companies (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Applications: one record from "saved" through "offer". The workspace is this row plus linked rows.
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  company_domain text,
  role_title text not null,
  location text,
  work_mode text check (work_mode in ('remote','hybrid','onsite','unknown')),
  job_url text,
  job_portal text,
  external_job_id text,
  external_application_id text,
  job_description text,
  status text not null default 'saved' check (status in (
    'saved','preparing','applied','acknowledged','under_review','recruiter_contacted','shortlisted',
    'assessment_pending','assessment_completed','interview_scheduling','interview_scheduled','interview_completed',
    'next_round','hr_round','offer_received','offer_accepted','selected','rejected','withdrawn','on_hold','no_response')),
  -- manual decisions are locked so automation cannot silently overwrite them
  status_locked boolean not null default false,
  status_source text not null default 'manual' check (status_source in ('manual','gmail','extension','system')),
  applied_at timestamptz,               -- known submission time (user or extension), never inferred from email time
  confirmation_received_at timestamptz, -- timestamp of the confirmation email
  last_activity_at timestamptz not null default now(),
  next_action text,
  next_action_due timestamptz,
  recruiter_id uuid references public.recruiter_contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  job_listing_id uuid references public.job_listings(id) on delete set null,
  resume_version_id uuid,
  salary_text text,
  notes text,
  gmail_thread_ids text[] not null default '{}',
  dedupe_key text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index applications_dedupe_uq on public.applications (user_id, dedupe_key) where dedupe_key is not null;
create index applications_user_status_idx on public.applications (user_id, status);
create index applications_user_company_idx on public.applications (user_id, lower(company));

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  source text not null check (source in ('manual','gmail','extension','system')),
  reason text,
  confidence numeric(4,3),
  evidence_message_id uuid,
  created_at timestamptz not null default now()
);
create index status_history_app_idx on public.status_history (application_id, created_at);

-- Append-only career event log (Engine B). No update policy is granted.
create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  type text not null check (type in (
    'job_saved','resume_prepared','cover_letter_generated','application_submitted','confirmation_received',
    'recruiter_reply','assessment_assigned','interview_requested','interview_scheduled','interview_rescheduled',
    'rejection_received','offer_received','follow_up_due','status_changed','note_added','document_exported')),
  occurred_at timestamptz not null default now(),
  source text not null default 'system' check (source in ('manual','gmail','extension','system')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index application_events_dedupe_uq on public.application_events (user_id, dedupe_key) where dedupe_key is not null;
create index application_events_app_idx on public.application_events (application_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Gmail and automation
-- ---------------------------------------------------------------------------
create table public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  -- AES-256-GCM ciphertext; never selectable by the authenticated role (see column grants below)
  encrypted_refresh_token text,
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','error','revoked','expired')),
  last_error text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.gmail_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  history_id text,
  watch_expiration timestamptz,
  last_synced_at timestamptz,
  last_full_sync_at timestamptz,
  import_status text not null default 'idle' check (import_status in ('idle','queued','running','completed','failed')),
  import_range_start timestamptz,
  import_range_end timestamptz,
  import_page_token text,
  import_counts jsonb not null default '{}'::jsonb,
  consecutive_failures int not null default 0,
  next_retry_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Minimal metadata only. Full email bodies are never stored.
create table public.processed_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  thread_id text,
  internal_date timestamptz,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  outcome text not null check (outcome in ('linked','created','review','ignored','error')),
  processed_at timestamptz not null default now()
);
create unique index processed_messages_uq on public.processed_messages (user_id, gmail_message_id);
create index processed_messages_thread_idx on public.processed_messages (user_id, thread_id);

create table public.email_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  processed_message_id uuid not null references public.processed_messages(id) on delete cascade,
  category text not null,
  confidence numeric(4,3) not null,
  extracted jsonb not null default '{}'::jsonb,
  method text not null check (method in ('rules','ai','rules+ai')),
  created_at timestamptz not null default now()
);

create table public.application_email_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  processed_message_id uuid not null references public.processed_messages(id) on delete cascade,
  match_confidence numeric(4,3) not null,
  match_reasons jsonb not null default '[]'::jsonb,
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  unique (application_id, processed_message_id)
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('email_match','status_change','new_application','duplicate')),
  processed_message_id uuid references public.processed_messages(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  suggestion jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  status text not null default 'open' check (status in ('open','accepted','rejected','dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index review_queue_open_idx on public.review_queue (user_id, status);

create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index automation_jobs_dedupe_uq on public.automation_jobs (dedupe_key) where dedupe_key is not null and status in ('queued','running');
create index automation_jobs_ready_idx on public.automation_jobs (status, run_after);

create table public.automation_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_id uuid references public.automation_jobs(id) on delete set null,
  job_type text,
  error text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents (files live in private storage; rows hold metadata)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('master_resume','tailored_resume','cover_letter','job_match_report','application_package',
    'certificate','experience_letter','relieving_letter','offer_letter','project_document','interview_notes','identity','other')),
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  version int not null default 1,
  parent_document_id uuid references public.documents(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);
create index documents_user_kind_idx on public.documents (user_id, kind);

create table public.master_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  label text not null,
  is_primary boolean not null default false,
  format text not null check (format in ('docx','pdf','doc')),
  extracted_text text,
  parsed jsonb,
  -- docx_native: original DOCX is the template. reconstructed_*: PDF-only, rebuilt template needs approval.
  template_status text not null default 'docx_native' check (template_status in ('docx_native','reconstructed_pending','reconstructed_approved')),
  template_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.job_match_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  analysis jsonb not null,
  match jsonb not null,
  score int,
  method text not null check (method in ('rules','ai','rules+ai')),
  created_at timestamptz not null default now()
);

create table public.tailored_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  master_resume_id uuid not null references public.master_resumes(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  job_match_report_id uuid references public.job_match_reports(id) on delete set null,
  -- [{paragraphIndex, original, proposed, reason, decision: pending|accepted|rejected|edited, final}]
  changes jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','final','submitted')),
  docx_document_id uuid references public.documents(id) on delete set null,
  pdf_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  tone text not null default 'professional' check (tone in ('professional','formal','confident','concise')),
  content text not null,
  docx_document_id uuid references public.documents(id) on delete set null,
  pdf_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications
  add constraint applications_resume_version_fk foreign key (resume_version_id) references public.tailored_resumes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_type text not null default 'copilot',
  application_id uuid references public.applications(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table public.generated_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  question text not null,
  answer text not null,
  tone text,
  char_limit int,
  missing_facts text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.approved_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  question text not null,
  answer text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id uuid,
  rating int check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Metadata only (sizes, status). Prompt and output content are not logged.
create table public.ai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  feature text not null,
  provider text not null,
  model text,
  input_chars int,
  output_chars int,
  status text not null check (status in ('ok','invalid_output','error','not_configured')),
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Interviews, assessments and learning
-- ---------------------------------------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  round_type text not null default 'other' check (round_type in ('hr','technical','managerial','behavioral','case','panel','final','other')),
  scheduled_at timestamptz,
  duration_minutes int,
  mode text check (mode in ('video','phone','onsite','unknown')),
  location_or_link text,
  interviewer text,
  status text not null default 'scheduled' check (status in ('requested','scheduled','rescheduled','completed','cancelled')),
  source text not null default 'manual' check (source in ('manual','gmail','extension','system')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  title text not null,
  platform text,
  link text,
  deadline timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','expired')),
  source text not null default 'manual' check (source in ('manual','gmail','extension','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  goal text,
  duration_days int not null,
  level text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  generated_by text not null default 'rules' check (generated_by in ('rules','ai')),
  created_at timestamptz not null default now()
);

create table public.learning_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  day int not null,
  sort_order int not null default 0,
  title text not null,
  description text,
  kind text not null default 'lesson' check (kind in ('lesson','practice','project','review','assessment')),
  skill text,
  resource_url text,
  completed_at timestamptz
);

-- System question bank rows have user_id null.
create table public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null,
  category text not null,
  question text not null,
  guidance text,
  difficulty text not null default 'intermediate' check (difficulty in ('beginner','intermediate','advanced')),
  source text not null default 'system' check (source in ('system','post_interview','user','ai')),
  created_at timestamptz not null default now()
);

create table public.interview_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  slug text,
  domain text not null,
  title text not null,
  situation text not null,
  task text not null,
  difficulty text not null default 'intermediate' check (difficulty in ('beginner','intermediate','advanced')),
  model_approach jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create unique index interview_scenarios_slug_uq on public.interview_scenarios (slug) where slug is not null;

create table public.scenario_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.interview_scenarios(id) on delete cascade,
  answer text not null,
  feedback jsonb,
  method text check (method in ('rules','ai')),
  created_at timestamptz not null default now()
);

create table public.mock_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  interview_type text not null check (interview_type in ('hr','technical','managerial','behavioral','scenario','resume','company')),
  target_role text,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  -- [{role: 'interviewer'|'candidate', text, at}] saved only with transcript consent
  transcript jsonb not null default '[]'::jsonb,
  transcript_saved boolean not null default false,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.mock_interview_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.mock_interview_sessions(id) on delete cascade,
  feedback jsonb not null,
  created_at timestamptz not null default now()
);

create table public.post_interview_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete set null,
  application_id uuid references public.applications(id) on delete cascade,
  questions_asked text[] not null default '{}',
  difficult_topics text[] not null default '{}',
  answers_given text,
  struggled_with text,
  recruiter_feedback text,
  observations text,
  next_steps text,
  analysis jsonb,
  user_corrections text,
  created_at timestamptz not null default now()
);

create table public.weaknesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  source text not null check (source in ('post_interview','mock_interview','scenario','self','assessment')),
  evidence text,
  status text not null default 'open' check (status in ('open','improving','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index weaknesses_topic_uq on public.weaknesses (user_id, lower(topic));

-- Completed activities only. No arbitrary skill scores.
create table public.skill_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  activity_type text not null check (activity_type in ('exercise','module','scenario','mock_interview','assessment','project')),
  activity_ref text,
  correct boolean,
  notes text,
  completed_at timestamptz not null default now()
);
create index skill_progress_user_idx on public.skill_progress (user_id, skill);

-- ---------------------------------------------------------------------------
-- Productivity
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  kind text not null default 'todo' check (kind in ('todo','follow_up','preparation','assessment','learning')),
  title text not null,
  due_at timestamptz,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('manual','system')),
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index tasks_dedupe_uq on public.tasks (user_id, dedupe_key) where dedupe_key is not null;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  application_id uuid references public.applications(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_matching_job','application_detected','recruiter_reply','status_update','assessment_received',
    'assessment_deadline','interview_invitation','interview_rescheduled','offer_received','follow_up_due','gmail_sync_failure','authorization_expired','review_needed')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create unique index notifications_dedupe_uq on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_unread_idx on public.notifications (user_id, read_at);

create table public.career_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  evidence jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  recruiter_id uuid references public.recruiter_contacts(id) on delete set null,
  kind text not null,
  subject text,
  body text not null,
  status text not null default 'draft' check (status in ('draft','sent_by_user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  company text not null,
  role_title text,
  fixed_ctc numeric(12,2),
  variable_pay numeric(12,2),
  joining_bonus numeric(12,2),
  other_bonus numeric(12,2),
  benefits text[] not null default '{}',
  joining_date date,
  probation_months int,
  notice_period_days int,
  location text,
  clauses jsonb not null default '[]'::jsonb,
  -- fields the analyzer could not find are listed here instead of being guessed
  missing_fields text[] not null default '{}',
  status text not null default 'evaluating' check (status in ('evaluating','negotiating','accepted','declined','expired')),
  decision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compensation_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  name text not null,
  annual_amount numeric(12,2),
  kind text not null default 'fixed' check (kind in ('fixed','variable','bonus','benefit','deduction','other'))
);

create table public.offer_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_ids uuid[] not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.onboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.scam_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_excerpt text not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  signals jsonb not null default '[]'::jsonb,
  method text not null check (method in ('rules','rules+ai')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','career_profiles','user_preferences','employment_history','education','verified_skills',
    'certifications','portfolio_projects','verified_achievements','recruiter_contacts','companies','applications','gmail_connections',
    'gmail_sync_state','tailored_resumes','cover_letters','approved_answers','interviews','assessments','weaknesses','outreach_drafts','offers']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_own on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  -- Tables where the user has full control of their own rows
  foreach t in array array['career_profiles','user_preferences','employment_history','education','verified_skills','certifications',
    'portfolio_projects','verified_achievements','portal_favorites','saved_searches','job_listings','job_alerts','recruiter_contacts',
    'companies','applications','status_history','gmail_sync_state','processed_messages','email_classifications',
    'application_email_links','review_queue','documents','master_resumes','job_match_reports','tailored_resumes','cover_letters',
    'ai_conversations','ai_messages','generated_answers','approved_answers','ai_feedback','interviews','assessments','learning_paths',
    'learning_modules','scenario_attempts','mock_interview_sessions','mock_interview_feedback','post_interview_reviews','weaknesses',
    'skill_progress','tasks','calendar_events','notifications','career_recommendations','outreach_drafts','offers',
    'compensation_components','offer_comparisons','onboarding_checklists','scam_checks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
  end loop;
end $$;

-- Append-only event log: users can read and add their own events, never edit them.
alter table public.application_events enable row level security;
create policy application_events_select on public.application_events for select to authenticated using (user_id = auth.uid());
create policy application_events_insert on public.application_events for insert to authenticated with check (user_id = auth.uid());

-- Gmail connection: users can see status and delete (disconnect); tokens are written by the server role only.
alter table public.gmail_connections enable row level security;
create policy gmail_connections_select on public.gmail_connections for select to authenticated using (user_id = auth.uid());
create policy gmail_connections_delete on public.gmail_connections for delete to authenticated using (user_id = auth.uid());

-- Automation internals: read-only for the owner.
alter table public.automation_jobs enable row level security;
create policy automation_jobs_select on public.automation_jobs for select to authenticated using (user_id = auth.uid());
alter table public.automation_errors enable row level security;
create policy automation_errors_select on public.automation_errors for select to authenticated using (user_id = auth.uid());
alter table public.ai_audit_logs enable row level security;
create policy ai_audit_logs_select on public.ai_audit_logs for select to authenticated using (user_id = auth.uid());

-- Shared catalogues: built-in rows readable by everyone signed in; custom rows only by their owner.
alter table public.job_sources enable row level security;
create policy job_sources_read on public.job_sources for select to authenticated using (user_id is null or user_id = auth.uid());
create policy job_sources_write on public.job_sources for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.interview_questions enable row level security;
create policy interview_questions_read on public.interview_questions for select to authenticated using (user_id is null or user_id = auth.uid());
create policy interview_questions_write on public.interview_questions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.interview_scenarios enable row level security;
create policy interview_scenarios_read on public.interview_scenarios for select to authenticated using (user_id is null or user_id = auth.uid());
create policy interview_scenarios_write on public.interview_scenarios for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges. RLS decides rows; grants decide tables and columns.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on public.automation_jobs, public.automation_errors, public.ai_audit_logs from authenticated;
grant select on public.automation_jobs, public.automation_errors, public.ai_audit_logs to authenticated;
revoke update, delete on public.application_events from authenticated;
-- OAuth token columns are never readable or writable through the user role.
revoke all on public.gmail_connections from authenticated;
grant select (user_id, google_email, scopes, status, last_error, connected_at, disconnected_at, access_token_expires_at, updated_at)
  on public.gmail_connections to authenticated;
grant delete on public.gmail_connections to authenticated;
revoke all on public.ai_audit_logs from anon;

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  insert into public.career_profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
