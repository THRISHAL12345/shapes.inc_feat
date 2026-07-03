-- Core session
CREATE TABLE IF NOT EXISTS negotiate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  shared_facts JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN (
    'pending_consent', 'active', 'converged', 'impasse', 'expired', 'timeout'
  )),
  visibility TEXT NOT NULL DEFAULT 'participants_and_groups'
    CHECK (visibility IN ('participants_only', 'participants_and_groups')),
  max_turns INT NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- One row per human/shape pair in the session
CREATE TABLE IF NOT EXISTS negotiate_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  human_id UUID NOT NULL,
  shape_id UUID NOT NULL,
  role TEXT NOT NULL, -- e.g. 'initiator', 'counterparty'
  consent_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN ('pending', 'accepted', 'declined')),
  UNIQUE(session_id, human_id)
);

-- PRIVATE constraints — row-level security keyed to owning shape only.
-- Never joined into a query that also touches the other participant's row
-- in the same application code path. See §5.2.
CREATE TABLE IF NOT EXISTS negotiate_private_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  participant_id UUID NOT NULL REFERENCES negotiate_participants(id),
  floor_value JSONB NOT NULL,
  ceiling_value JSONB NOT NULL,
  priority_weights JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only, visible transcript
CREATE TABLE IF NOT EXISTS negotiate_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES negotiate_sessions(id),
  participant_id UUID NOT NULL REFERENCES negotiate_participants(id),
  turn_number INT NOT NULL,
  offer JSONB NOT NULL,
  rationale TEXT NOT NULL,
  gap_after JSONB, -- computed gap metric snapshot for the live meter
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, turn_number)
);

CREATE TABLE IF NOT EXISTS negotiate_resolutions (
  session_id UUID PRIMARY KEY REFERENCES negotiate_sessions(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('converged', 'impasse', 'timeout')),
  final_terms JSONB,
  confidence NUMERIC,
  divergence_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
