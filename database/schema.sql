-- Performance Arena BRD v2 database schema
-- Target: PostgreSQL behind the production REST API.
-- Source of truth for entity inventory: Performance_Arena_Clover_Medicare_BRD_Screen_By_Screen_v2.docx.
-- Column coverage is aligned to current source data.js; import templates keep the BRD/source
-- entity names while database identifiers use lower_snake_case.

BEGIN;

CREATE TABLE app_config (
  config_id TEXT PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'date', 'url')),
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_modified_by TEXT,
  last_modified_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_log (
  import_id TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  uploaded_by TEXT,
  upload_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('replace', 'upsert')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'validating', 'validation_failed', 'committed', 'failed', 'cancelled', 'reverted')),
  validation_error_count INTEGER NOT NULL DEFAULT 0 CHECK (validation_error_count >= 0),
  rows_added INTEGER NOT NULL DEFAULT 0 CHECK (rows_added >= 0),
  rows_modified INTEGER NOT NULL DEFAULT 0 CHECK (rows_modified >= 0),
  rows_deleted INTEGER NOT NULL DEFAULT 0 CHECK (rows_deleted >= 0),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  commit_timestamp TIMESTAMPTZ,
  reverted_from_import_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feature_flags (
  flag_id TEXT PRIMARY KEY,
  flag_key TEXT NOT NULL UNIQUE,
  flag_label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  scope TEXT NOT NULL DEFAULT 'All' CHECK (scope IN ('All', 'Role', 'Team')),
  scope_role TEXT CHECK (scope_role IN ('Agent', 'Team Lead', 'Manager', 'Admin')),
  scope_team_id TEXT,
  modified_by TEXT,
  modified_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'All' AND scope_role IS NULL AND scope_team_id IS NULL)
    OR (scope = 'Role' AND scope_role IS NOT NULL AND scope_team_id IS NULL)
    OR (scope = 'Team' AND scope_team_id IS NOT NULL AND scope_role IS NULL)
  )
);

CREATE TABLE admin_audit_log (
  log_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_affected TEXT NOT NULL,
  record_id TEXT,
  before_snapshot JSONB,
  after_snapshot JSONB,
  action_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  import_id TEXT,
  config_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Agent', 'Team Lead', 'Manager', 'Admin')),
  team_id TEXT,
  process_id TEXT,
  location TEXT,
  manager_id TEXT,
  avatar TEXT,
  level TEXT,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  arena_points INTEGER NOT NULL DEFAULT 0 CHECK (arena_points >= 0),
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  team_name TEXT NOT NULL,
  process_id TEXT NOT NULL,
  shift TEXT,
  location TEXT,
  team_lead_id TEXT,
  manager_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processes (
  process_id TEXT PRIMARY KEY,
  process_name TEXT NOT NULL,
  process_type TEXT,
  description TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kpi_master (
  kpi_id TEXT PRIMARY KEY,
  kpi_name TEXT NOT NULL,
  kpi_type TEXT NOT NULL,
  unit TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('Higher', 'Lower')),
  target NUMERIC(14,4) NOT NULL,
  green_threshold NUMERIC(14,4),
  amber_threshold NUMERIC(14,4),
  red_threshold NUMERIC(14,4),
  weightage NUMERIC(8,4) NOT NULL DEFAULT 0,
  applicability TEXT,
  description TEXT,
  visible_agent BOOLEAN NOT NULL DEFAULT TRUE,
  visible_team_lead BOOLEAN NOT NULL DEFAULT TRUE,
  visible_manager BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  retired_at TIMESTAMPTZ,
  retired_by TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE performance_data (
  performance_date DATE NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  kpi_id TEXT NOT NULL,
  target NUMERIC(14,4) NOT NULL,
  actual NUMERIC(14,4) NOT NULL,
  variance NUMERIC(14,4),
  score NUMERIC(8,4),
  status TEXT NOT NULL CHECK (status IN ('Green', 'Amber', 'Red')),
  points_earned INTEGER NOT NULL DEFAULT 0,
  volume INTEGER NOT NULL DEFAULT 0 CHECK (volume >= 0),
  kpi_name TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (performance_date, user_id, team_id, process_id, kpi_id)
);

CREATE TABLE daily_agent_score (
  score_date DATE NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  performance_score NUMERIC(8,4) NOT NULL,
  rag_status TEXT NOT NULL CHECK (rag_status IN ('Green', 'Amber', 'Red')),
  points_earned INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  rank_team INTEGER,
  rank_process INTEGER,
  rank_account INTEGER,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (score_date, user_id)
);

CREATE TABLE agent_current (
  user_id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  performance_score NUMERIC(8,4) NOT NULL,
  rag_status TEXT NOT NULL CHECK (rag_status IN ('Green', 'Amber', 'Red')),
  points_earned_today INTEGER NOT NULL DEFAULT 0,
  arena_points_balance INTEGER NOT NULL DEFAULT 0,
  level TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  team_rank INTEGER,
  process_rank INTEGER,
  account_rank INTEGER,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leaderboard (
  leaderboard_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('Agent', 'Team', 'Process', 'Account', 'Challenge', 'All')),
  scope_id TEXT,
  user_id TEXT NOT NULL,
  team_id TEXT,
  process_id TEXT,
  rank INTEGER NOT NULL CHECK (rank > 0),
  performance_score NUMERIC(8,4) NOT NULL,
  rag_status TEXT NOT NULL CHECK (rag_status IN ('Green', 'Amber', 'Red')),
  points_earned_today INTEGER NOT NULL DEFAULT 0,
  arena_points_balance INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level TEXT,
  snapshot_date DATE NOT NULL,
  period TEXT NOT NULL,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE points_ledger (
  ledger_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ledger_timestamp TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE xp_ledger (
  ledger_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ledger_timestamp TIMESTAMPTZ NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  xp_delta INTEGER NOT NULL,
  description TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE missions (
  mission_id TEXT PRIMARY KEY,
  mission_name TEXT NOT NULL,
  mission_type TEXT NOT NULL,
  description TEXT,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('Agent', 'Team', 'Process', 'Account', 'All', 'Role')),
  audience_id TEXT,
  kpi_id TEXT,
  target_value NUMERIC(14,4),
  reward_points INTEGER NOT NULL DEFAULT 0,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  badge_id TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  commercial_linkage TEXT,
  created_by TEXT,
  linked_module_id TEXT,
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE mission_assignments (
  assignment_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT,
  joined_date DATE NOT NULL,
  progress NUMERIC(8,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  completion_date DATE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenges (
  challenge_id TEXT PRIMARY KEY,
  challenge_name TEXT NOT NULL,
  challenge_type TEXT NOT NULL,
  kpi_id TEXT,
  start_date DATE,
  end_date DATE,
  entry_points INTEGER NOT NULL DEFAULT 0 CHECK (entry_points >= 0),
  reward_pool INTEGER NOT NULL DEFAULT 0 CHECK (reward_pool >= 0),
  xp_reward INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  min_volume INTEGER NOT NULL DEFAULT 0 CHECK (min_volume >= 0),
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  description TEXT,
  commercial_linkage TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE challenge_participants (
  participant_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  side TEXT,
  joined_date DATE NOT NULL,
  status TEXT NOT NULL,
  entry_paid INTEGER NOT NULL DEFAULT 0 CHECK (entry_paid >= 0),
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_results (
  result_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  winner_user_id TEXT,
  loser_user_id TEXT,
  score_a NUMERIC(14,4),
  score_b NUMERIC(14,4),
  settled_date DATE,
  pool_awarded INTEGER NOT NULL DEFAULT 0 CHECK (pool_awarded >= 0),
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  notes TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE badges (
  badge_id TEXT PRIMARY KEY,
  badge_name TEXT NOT NULL,
  badge_category TEXT,
  tier TEXT,
  criteria TEXT,
  icon TEXT,
  points_bonus INTEGER NOT NULL DEFAULT 0,
  xp_bonus INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  retired_at TIMESTAMPTZ,
  retired_by TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (badge_name)
);

CREATE TABLE agent_badges (
  agent_badge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  earned_date DATE NOT NULL,
  source_type TEXT,
  source_id TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rewards (
  reward_id TEXT PRIMARY KEY,
  reward_name TEXT NOT NULL,
  category TEXT,
  icon TEXT,
  description TEXT,
  points_required INTEGER NOT NULL CHECK (points_required >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  eligibility_rule TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expiry_date DATE,
  tier TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reward_redemptions (
  redemption_id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redemption_date TIMESTAMPTZ NOT NULL,
  points_spent INTEGER NOT NULL CHECK (points_spent >= 0),
  status TEXT NOT NULL,
  fulfilment_owner TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE communications (
  communication_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('Agent', 'Team', 'Process', 'Account', 'All', 'Role')),
  audience_id TEXT,
  content TEXT NOT NULL,
  published_by TEXT,
  published_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  requires_ack BOOLEAN NOT NULL DEFAULT FALSE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE communication_status (
  communication_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  viewed BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_score NUMERIC(8,4),
  completion_date TIMESTAMPTZ,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (communication_id, user_id)
);

CREATE TABLE learning_modules (
  module_id TEXT PRIMARY KEY,
  module_type TEXT NOT NULL,
  title TEXT NOT NULL,
  priority TEXT,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('Agent', 'Team', 'Process', 'Account', 'All', 'Role')),
  audience_id TEXT,
  published_by TEXT,
  content_format TEXT,
  description TEXT,
  published_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  requires_ack BOOLEAN NOT NULL DEFAULT FALSE,
  requires_completion BOOLEAN NOT NULL DEFAULT FALSE,
  has_pkt BOOLEAN NOT NULL DEFAULT FALSE,
  points_on_completion INTEGER NOT NULL DEFAULT 0,
  xp_on_completion INTEGER NOT NULL DEFAULT 0,
  badge_unlock TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_assignments (
  assignment_id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  agent_name TEXT,
  team_id TEXT,
  process_id TEXT,
  audience_type TEXT,
  audience_id TEXT,
  assigned_date DATE NOT NULL,
  due_date DATE,
  assignment_status TEXT NOT NULL,
  overdue BOOLEAN NOT NULL DEFAULT FALSE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_completion_status (
  assignment_id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  viewed BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completion_date TIMESTAMPTZ,
  status TEXT NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  badge_earned TEXT,
  overdue BOOLEAN NOT NULL DEFAULT FALSE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pkt_assessments (
  pkt_id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  pkt_title TEXT NOT NULL,
  pass_score NUMERIC(8,4) NOT NULL,
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
  question_count INTEGER NOT NULL CHECK (question_count >= 0),
  points_on_pass INTEGER NOT NULL DEFAULT 0,
  xp_on_pass INTEGER NOT NULL DEFAULT 0,
  first_attempt_bonus INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pkt_questions (
  question_id TEXT PRIMARY KEY,
  pkt_id TEXT NOT NULL,
  question_no INTEGER NOT NULL CHECK (question_no > 0),
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pkt_id, question_no)
);

CREATE TABLE pkt_attempts (
  attempt_id TEXT PRIMARY KEY,
  pkt_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  agent_name TEXT,
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  attempt_date TIMESTAMPTZ NOT NULL,
  score NUMERIC(8,4) NOT NULL,
  pass_score NUMERIC(8,4) NOT NULL,
  result TEXT NOT NULL,
  points_earned INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  first_attempt_pass BOOLEAN NOT NULL DEFAULT FALSE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sla_commercial_rules (
  rule_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kpi_id TEXT NOT NULL,
  kpi_name TEXT,
  target NUMERIC(14,4) NOT NULL,
  measurement_period TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('Higher', 'Lower')),
  currency TEXT NOT NULL DEFAULT 'USD',
  max_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_reward NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ,
  published_by TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE penalty_reward_slabs (
  slab_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  variance_from NUMERIC(14,4) NOT NULL,
  variance_to NUMERIC(14,4) NOT NULL,
  impact_type TEXT NOT NULL CHECK (impact_type IN ('Penalty', 'Reward', 'Neutral')),
  penalty_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reward_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (variance_to >= variance_from)
);

CREATE TABLE commercial_exposure (
  snapshot_date DATE NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  entity_level TEXT NOT NULL CHECK (entity_level IN ('Account', 'Team', 'Process')),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  kpi_id TEXT NOT NULL,
  kpi_name TEXT,
  target NUMERIC(14,4) NOT NULL,
  actual_mtd NUMERIC(14,4) NOT NULL,
  forecast_eom NUMERIC(14,4) NOT NULL,
  variance_to_target NUMERIC(14,4),
  forecast_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  forecast_reward NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
  recovery_required NUMERIC(14,4),
  risk_level TEXT,
  impact_type TEXT,
  revenue_mtd NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate_card_per_call NUMERIC(14,4) NOT NULL DEFAULT 0,
  billable_calls_mtd INTEGER NOT NULL DEFAULT 0,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, account_id, entity_level, entity_id, kpi_id)
);

CREATE TABLE commercial_verification (
  verification_id TEXT PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  entity_level TEXT NOT NULL CHECK (entity_level IN ('Account', 'Team', 'Process')),
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  kpi_id TEXT NOT NULL,
  kpi_name TEXT,
  target NUMERIC(14,4) NOT NULL,
  actual_mtd NUMERIC(14,4) NOT NULL,
  forecast_eom NUMERIC(14,4) NOT NULL,
  variance_to_target NUMERIC(14,4),
  forecast_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  forecast_reward NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
  recovery_required NUMERIC(14,4),
  risk_level TEXT,
  impact_type TEXT,
  revenue_mtd NUMERIC(14,2) NOT NULL DEFAULT 0,
  rate_card_per_call NUMERIC(14,4) NOT NULL DEFAULT 0,
  billable_calls_mtd INTEGER NOT NULL DEFAULT 0,
  verifier_role TEXT NOT NULL CHECK (verifier_role IN ('Team Lead', 'Manager', 'Admin')),
  owner_id TEXT,
  verification_status TEXT NOT NULL,
  verified_by TEXT,
  comments TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE what_if_scenarios (
  scenario_id TEXT PRIMARY KEY,
  kpi_id TEXT NOT NULL,
  kpi_name TEXT,
  current_forecast NUMERIC(14,4) NOT NULL,
  improvement_assumption NUMERIC(14,4) NOT NULL,
  projected_forecast NUMERIC(14,4) NOT NULL,
  current_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  projected_penalty NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_reward NUMERIC(14,2) NOT NULL DEFAULT 0,
  projected_reward NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_improvement NUMERIC(14,2) NOT NULL DEFAULT 0,
  recommended_team TEXT,
  revenue_mtd NUMERIC(14,2) NOT NULL DEFAULT 0,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coaching (
  coaching_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kpi_id TEXT,
  trigger_reason TEXT,
  coaching_note TEXT,
  assigned_by TEXT,
  assigned_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL,
  reason TEXT,
  recommended_action TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recognition (
  recognition_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  given_by TEXT NOT NULL,
  given_date TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  reason TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  public BOOLEAN NOT NULL DEFAULT FALSE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_points_rules (
  activity TEXT NOT NULL,
  module_type TEXT NOT NULL,
  arena_points INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  badge_eligibility TEXT,
  rule_description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity, module_type)
);

CREATE TABLE tl_manager_verification (
  owner_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_title TEXT,
  assigned INTEGER NOT NULL DEFAULT 0,
  viewed INTEGER NOT NULL DEFAULT 0,
  viewed_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
  pkt_passed INTEGER NOT NULL DEFAULT 0,
  pkt_failed INTEGER NOT NULL DEFAULT 0,
  not_started INTEGER NOT NULL DEFAULT 0,
  overdue INTEGER NOT NULL DEFAULT 0,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  risk_status TEXT,
  import_id TEXT,
  source_row_number INTEGER,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, team_id, module_id)
);

-- Foreign keys are added after table creation to support circular references
-- such as users <-> teams and optional control-table references.
ALTER TABLE app_config ADD CONSTRAINT fk_app_config_last_modified_by FOREIGN KEY (last_modified_by) REFERENCES users(user_id);
ALTER TABLE import_log ADD CONSTRAINT fk_import_log_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(user_id);
ALTER TABLE import_log ADD CONSTRAINT fk_import_log_reverted_from FOREIGN KEY (reverted_from_import_id) REFERENCES import_log(import_id);
ALTER TABLE feature_flags ADD CONSTRAINT fk_feature_flags_scope_team FOREIGN KEY (scope_team_id) REFERENCES teams(team_id);
ALTER TABLE feature_flags ADD CONSTRAINT fk_feature_flags_modified_by FOREIGN KEY (modified_by) REFERENCES users(user_id);
ALTER TABLE admin_audit_log ADD CONSTRAINT fk_admin_audit_log_admin_user FOREIGN KEY (admin_user_id) REFERENCES users(user_id);
ALTER TABLE admin_audit_log ADD CONSTRAINT fk_admin_audit_log_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE users ADD CONSTRAINT fk_users_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE users ADD CONSTRAINT fk_users_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE users ADD CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(user_id);
ALTER TABLE users ADD CONSTRAINT fk_users_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE teams ADD CONSTRAINT fk_teams_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_team_lead FOREIGN KEY (team_lead_id) REFERENCES users(user_id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_manager FOREIGN KEY (manager_id) REFERENCES users(user_id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE processes ADD CONSTRAINT fk_processes_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE kpi_master ADD CONSTRAINT fk_kpi_master_retired_by FOREIGN KEY (retired_by) REFERENCES users(user_id);
ALTER TABLE kpi_master ADD CONSTRAINT fk_kpi_master_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE performance_data ADD CONSTRAINT fk_performance_data_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE performance_data ADD CONSTRAINT fk_performance_data_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE performance_data ADD CONSTRAINT fk_performance_data_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE performance_data ADD CONSTRAINT fk_performance_data_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE performance_data ADD CONSTRAINT fk_performance_data_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE daily_agent_score ADD CONSTRAINT fk_daily_agent_score_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE daily_agent_score ADD CONSTRAINT fk_daily_agent_score_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE daily_agent_score ADD CONSTRAINT fk_daily_agent_score_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE daily_agent_score ADD CONSTRAINT fk_daily_agent_score_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE agent_current ADD CONSTRAINT fk_agent_current_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE agent_current ADD CONSTRAINT fk_agent_current_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE agent_current ADD CONSTRAINT fk_agent_current_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE agent_current ADD CONSTRAINT fk_agent_current_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE leaderboard ADD CONSTRAINT fk_leaderboard_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE leaderboard ADD CONSTRAINT fk_leaderboard_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE leaderboard ADD CONSTRAINT fk_leaderboard_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE leaderboard ADD CONSTRAINT fk_leaderboard_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE points_ledger ADD CONSTRAINT fk_points_ledger_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE points_ledger ADD CONSTRAINT fk_points_ledger_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE xp_ledger ADD CONSTRAINT fk_xp_ledger_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE xp_ledger ADD CONSTRAINT fk_xp_ledger_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE missions ADD CONSTRAINT fk_missions_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE missions ADD CONSTRAINT fk_missions_badge FOREIGN KEY (badge_id) REFERENCES badges(badge_id);
ALTER TABLE missions ADD CONSTRAINT fk_missions_created_by FOREIGN KEY (created_by) REFERENCES users(user_id);
ALTER TABLE missions ADD CONSTRAINT fk_missions_linked_module FOREIGN KEY (linked_module_id) REFERENCES learning_modules(module_id);
ALTER TABLE missions ADD CONSTRAINT fk_missions_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES users(user_id);
ALTER TABLE missions ADD CONSTRAINT fk_missions_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE mission_assignments ADD CONSTRAINT fk_mission_assignments_mission FOREIGN KEY (mission_id) REFERENCES missions(mission_id);
ALTER TABLE mission_assignments ADD CONSTRAINT fk_mission_assignments_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE mission_assignments ADD CONSTRAINT fk_mission_assignments_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE mission_assignments ADD CONSTRAINT fk_mission_assignments_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE challenges ADD CONSTRAINT fk_challenges_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE challenges ADD CONSTRAINT fk_challenges_created_by FOREIGN KEY (created_by) REFERENCES users(user_id);
ALTER TABLE challenges ADD CONSTRAINT fk_challenges_closed_by FOREIGN KEY (closed_by) REFERENCES users(user_id);
ALTER TABLE challenges ADD CONSTRAINT fk_challenges_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE challenge_participants ADD CONSTRAINT fk_challenge_participants_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(challenge_id);
ALTER TABLE challenge_participants ADD CONSTRAINT fk_challenge_participants_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE challenge_participants ADD CONSTRAINT fk_challenge_participants_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE challenge_results ADD CONSTRAINT fk_challenge_results_challenge FOREIGN KEY (challenge_id) REFERENCES challenges(challenge_id);
ALTER TABLE challenge_results ADD CONSTRAINT fk_challenge_results_winner FOREIGN KEY (winner_user_id) REFERENCES users(user_id);
ALTER TABLE challenge_results ADD CONSTRAINT fk_challenge_results_loser FOREIGN KEY (loser_user_id) REFERENCES users(user_id);
ALTER TABLE challenge_results ADD CONSTRAINT fk_challenge_results_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE badges ADD CONSTRAINT fk_badges_retired_by FOREIGN KEY (retired_by) REFERENCES users(user_id);
ALTER TABLE badges ADD CONSTRAINT fk_badges_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE agent_badges ADD CONSTRAINT fk_agent_badges_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE agent_badges ADD CONSTRAINT fk_agent_badges_badge FOREIGN KEY (badge_id) REFERENCES badges(badge_id);
ALTER TABLE agent_badges ADD CONSTRAINT fk_agent_badges_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE rewards ADD CONSTRAINT fk_rewards_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE reward_redemptions ADD CONSTRAINT fk_reward_redemptions_reward FOREIGN KEY (reward_id) REFERENCES rewards(reward_id);
ALTER TABLE reward_redemptions ADD CONSTRAINT fk_reward_redemptions_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE reward_redemptions ADD CONSTRAINT fk_reward_redemptions_fulfilment_owner FOREIGN KEY (fulfilment_owner) REFERENCES users(user_id);
ALTER TABLE reward_redemptions ADD CONSTRAINT fk_reward_redemptions_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE communications ADD CONSTRAINT fk_communications_published_by FOREIGN KEY (published_by) REFERENCES users(user_id);
ALTER TABLE communications ADD CONSTRAINT fk_communications_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE communication_status ADD CONSTRAINT fk_communication_status_communication FOREIGN KEY (communication_id) REFERENCES communications(communication_id);
ALTER TABLE communication_status ADD CONSTRAINT fk_communication_status_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE communication_status ADD CONSTRAINT fk_communication_status_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE learning_modules ADD CONSTRAINT fk_learning_modules_published_by FOREIGN KEY (published_by) REFERENCES users(user_id);
ALTER TABLE learning_modules ADD CONSTRAINT fk_learning_modules_badge_unlock FOREIGN KEY (badge_unlock) REFERENCES badges(badge_name);
ALTER TABLE learning_modules ADD CONSTRAINT fk_learning_modules_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE learning_assignments ADD CONSTRAINT fk_learning_assignments_module FOREIGN KEY (module_id) REFERENCES learning_modules(module_id);
ALTER TABLE learning_assignments ADD CONSTRAINT fk_learning_assignments_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE learning_assignments ADD CONSTRAINT fk_learning_assignments_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE learning_assignments ADD CONSTRAINT fk_learning_assignments_process FOREIGN KEY (process_id) REFERENCES processes(process_id);
ALTER TABLE learning_assignments ADD CONSTRAINT fk_learning_assignments_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE learning_completion_status ADD CONSTRAINT fk_learning_completion_status_assignment FOREIGN KEY (assignment_id) REFERENCES learning_assignments(assignment_id);
ALTER TABLE learning_completion_status ADD CONSTRAINT fk_learning_completion_status_module FOREIGN KEY (module_id) REFERENCES learning_modules(module_id);
ALTER TABLE learning_completion_status ADD CONSTRAINT fk_learning_completion_status_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE learning_completion_status ADD CONSTRAINT fk_learning_completion_status_badge FOREIGN KEY (badge_earned) REFERENCES badges(badge_name);
ALTER TABLE learning_completion_status ADD CONSTRAINT fk_learning_completion_status_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE pkt_assessments ADD CONSTRAINT fk_pkt_assessments_module FOREIGN KEY (module_id) REFERENCES learning_modules(module_id);
ALTER TABLE pkt_assessments ADD CONSTRAINT fk_pkt_assessments_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE pkt_questions ADD CONSTRAINT fk_pkt_questions_pkt FOREIGN KEY (pkt_id) REFERENCES pkt_assessments(pkt_id);
ALTER TABLE pkt_questions ADD CONSTRAINT fk_pkt_questions_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE pkt_attempts ADD CONSTRAINT fk_pkt_attempts_pkt FOREIGN KEY (pkt_id) REFERENCES pkt_assessments(pkt_id);
ALTER TABLE pkt_attempts ADD CONSTRAINT fk_pkt_attempts_module FOREIGN KEY (module_id) REFERENCES learning_modules(module_id);
ALTER TABLE pkt_attempts ADD CONSTRAINT fk_pkt_attempts_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE pkt_attempts ADD CONSTRAINT fk_pkt_attempts_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE sla_commercial_rules ADD CONSTRAINT fk_sla_commercial_rules_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE sla_commercial_rules ADD CONSTRAINT fk_sla_commercial_rules_published_by FOREIGN KEY (published_by) REFERENCES users(user_id);
ALTER TABLE sla_commercial_rules ADD CONSTRAINT fk_sla_commercial_rules_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE penalty_reward_slabs ADD CONSTRAINT fk_penalty_reward_slabs_rule FOREIGN KEY (rule_id) REFERENCES sla_commercial_rules(rule_id);
ALTER TABLE penalty_reward_slabs ADD CONSTRAINT fk_penalty_reward_slabs_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE commercial_exposure ADD CONSTRAINT fk_commercial_exposure_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE commercial_exposure ADD CONSTRAINT fk_commercial_exposure_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE commercial_verification ADD CONSTRAINT fk_commercial_verification_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE commercial_verification ADD CONSTRAINT fk_commercial_verification_owner FOREIGN KEY (owner_id) REFERENCES users(user_id);
ALTER TABLE commercial_verification ADD CONSTRAINT fk_commercial_verification_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id);
ALTER TABLE commercial_verification ADD CONSTRAINT fk_commercial_verification_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE what_if_scenarios ADD CONSTRAINT fk_what_if_scenarios_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE what_if_scenarios ADD CONSTRAINT fk_what_if_scenarios_recommended_team FOREIGN KEY (recommended_team) REFERENCES teams(team_id);
ALTER TABLE what_if_scenarios ADD CONSTRAINT fk_what_if_scenarios_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE coaching ADD CONSTRAINT fk_coaching_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE coaching ADD CONSTRAINT fk_coaching_kpi FOREIGN KEY (kpi_id) REFERENCES kpi_master(kpi_id);
ALTER TABLE coaching ADD CONSTRAINT fk_coaching_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(user_id);
ALTER TABLE coaching ADD CONSTRAINT fk_coaching_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE recognition ADD CONSTRAINT fk_recognition_user FOREIGN KEY (user_id) REFERENCES users(user_id);
ALTER TABLE recognition ADD CONSTRAINT fk_recognition_given_by FOREIGN KEY (given_by) REFERENCES users(user_id);
ALTER TABLE recognition ADD CONSTRAINT fk_recognition_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE learning_points_rules ADD CONSTRAINT fk_learning_points_rules_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

ALTER TABLE tl_manager_verification ADD CONSTRAINT fk_tl_manager_verification_owner FOREIGN KEY (owner_id) REFERENCES users(user_id);
ALTER TABLE tl_manager_verification ADD CONSTRAINT fk_tl_manager_verification_team FOREIGN KEY (team_id) REFERENCES teams(team_id);
ALTER TABLE tl_manager_verification ADD CONSTRAINT fk_tl_manager_verification_module FOREIGN KEY (module_id) REFERENCES learning_modules(module_id);
ALTER TABLE tl_manager_verification ADD CONSTRAINT fk_tl_manager_verification_import FOREIGN KEY (import_id) REFERENCES import_log(import_id);

-- Role/scoped read indexes used by Agent, Team Lead, Manager, and Admin views.
CREATE INDEX idx_users_role_active ON users (role, is_active);
CREATE INDEX idx_users_team_process_active ON users (team_id, process_id, is_active);
CREATE INDEX idx_users_manager ON users (manager_id);
CREATE INDEX idx_teams_process_active ON teams (process_id, is_active);
CREATE INDEX idx_teams_lead_manager ON teams (team_lead_id, manager_id);
CREATE INDEX idx_kpi_master_active_role ON kpi_master (is_active, visible_agent, visible_team_lead, visible_manager);
CREATE INDEX idx_performance_user_date ON performance_data (user_id, performance_date DESC);
CREATE INDEX idx_performance_team_scope ON performance_data (team_id, process_id, performance_date DESC, status);
CREATE INDEX idx_performance_kpi_scope ON performance_data (kpi_id, team_id, process_id, performance_date DESC);
CREATE INDEX idx_daily_score_user_date ON daily_agent_score (user_id, score_date DESC);
CREATE INDEX idx_daily_score_team_rag ON daily_agent_score (team_id, process_id, rag_status, score_date DESC);
CREATE INDEX idx_agent_current_team_scope ON agent_current (team_id, process_id, rag_status);
CREATE INDEX idx_leaderboard_scope_rank ON leaderboard (scope, scope_id, period, rank);
CREATE INDEX idx_leaderboard_user_period ON leaderboard (user_id, period);
CREATE INDEX idx_points_ledger_user_time ON points_ledger (user_id, ledger_timestamp DESC);
CREATE INDEX idx_xp_ledger_user_time ON xp_ledger (user_id, ledger_timestamp DESC);
CREATE INDEX idx_missions_audience_active ON missions (audience_type, audience_id, is_active, status);
CREATE INDEX idx_missions_kpi ON missions (kpi_id);
CREATE INDEX idx_mission_assignments_user_status ON mission_assignments (user_id, status);
CREATE INDEX idx_mission_assignments_team_status ON mission_assignments (team_id, status);
CREATE INDEX idx_challenges_status_dates ON challenges (is_active, status, start_date, end_date);
CREATE INDEX idx_challenge_participants_challenge_status ON challenge_participants (challenge_id, status);
CREATE INDEX idx_challenge_participants_user ON challenge_participants (user_id);
CREATE INDEX idx_badges_active_category ON badges (is_active, badge_category, tier);
CREATE INDEX idx_rewards_active_category ON rewards (is_active, category, tier);
CREATE INDEX idx_reward_redemptions_user_status ON reward_redemptions (user_id, status, redemption_date DESC);
CREATE INDEX idx_reward_redemptions_status_owner ON reward_redemptions (status, fulfilment_owner);
CREATE INDEX idx_communications_audience_due ON communications (audience_type, audience_id, due_date);
CREATE INDEX idx_communication_status_user ON communication_status (user_id, viewed, acknowledged);
CREATE INDEX idx_learning_modules_audience_active ON learning_modules (audience_type, audience_id, is_active, status);
CREATE INDEX idx_learning_assignments_user_status ON learning_assignments (user_id, assignment_status, due_date);
CREATE INDEX idx_learning_assignments_team_status ON learning_assignments (team_id, process_id, assignment_status, overdue);
CREATE INDEX idx_learning_completion_user_status ON learning_completion_status (user_id, status, overdue);
CREATE INDEX idx_pkt_attempts_user_pkt ON pkt_attempts (user_id, pkt_id, attempt_no);
CREATE INDEX idx_sla_rules_account_kpi_active ON sla_commercial_rules (account_id, kpi_id, is_active);
CREATE INDEX idx_penalty_slabs_rule_active ON penalty_reward_slabs (rule_id, is_active, variance_from, variance_to);
CREATE INDEX idx_commercial_exposure_scope ON commercial_exposure (account_id, entity_level, entity_id, snapshot_date DESC);
CREATE INDEX idx_commercial_exposure_kpi_risk ON commercial_exposure (kpi_id, risk_level, snapshot_date DESC);
CREATE INDEX idx_commercial_verification_owner_status ON commercial_verification (owner_id, verifier_role, verification_status);
CREATE INDEX idx_what_if_kpi_team ON what_if_scenarios (kpi_id, recommended_team);
CREATE INDEX idx_coaching_user_status ON coaching (user_id, status, due_date);
CREATE INDEX idx_coaching_assigned_status ON coaching (assigned_by, status);
CREATE INDEX idx_recognition_user_date ON recognition (user_id, given_date DESC);
CREATE INDEX idx_recognition_public_date ON recognition (public, given_date DESC);
CREATE INDEX idx_tl_manager_verification_owner_team ON tl_manager_verification (owner_id, team_id, risk_status);
CREATE INDEX idx_import_log_entity_status ON import_log (entity_name, status, upload_date DESC);
CREATE INDEX idx_import_log_uploaded_by ON import_log (uploaded_by, upload_date DESC);
CREATE INDEX idx_app_config_key_active ON app_config (config_key, is_active);
CREATE INDEX idx_feature_flags_scope_enabled ON feature_flags (scope, scope_role, scope_team_id, enabled);
CREATE INDEX idx_admin_audit_admin_time ON admin_audit_log (admin_user_id, action_timestamp DESC);
CREATE INDEX idx_admin_audit_entity_time ON admin_audit_log (entity_affected, action_type, action_timestamp DESC);

COMMIT;
