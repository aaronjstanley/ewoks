CREATE TABLE IF NOT EXISTS diagnostic_logs (
    id bigserial PRIMARY KEY,
    session_id text NOT NULL,
    player_name text NOT NULL DEFAULT '',
    page_path text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    dump_text text NOT NULL,
    entry_count integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnostic_logs_created_at_idx
    ON diagnostic_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS diagnostic_logs_session_id_idx
    ON diagnostic_logs (session_id, created_at DESC);
