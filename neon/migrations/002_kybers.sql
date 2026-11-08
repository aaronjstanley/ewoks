ALTER TABLE players
    ADD COLUMN IF NOT EXISTS highest_completed_level smallint NOT NULL DEFAULT 0
        CHECK (highest_completed_level BETWEEN 0 AND 220),
    ADD COLUMN IF NOT EXISTS kybers bigint NOT NULL DEFAULT 0 CHECK (kybers >= 0),
    ADD COLUMN IF NOT EXISTS total_time_ms bigint NOT NULL DEFAULT 0 CHECK (total_time_ms >= 0),
    ADD COLUMN IF NOT EXISTS score_version smallint NOT NULL DEFAULT 1
        CHECK (score_version BETWEEN 1 AND 2),
    ADD COLUMN IF NOT EXISTS score_difficulty smallint NOT NULL DEFAULT 0
        CHECK (score_difficulty BETWEEN 0 AND 4),
    ADD COLUMN IF NOT EXISTS speed_set numeric(4,2) NOT NULL DEFAULT 1
        CHECK (speed_set > 0 AND speed_set <= 10);

DROP INDEX IF EXISTS players_leaderboard_idx;

CREATE INDEX IF NOT EXISTS players_kybers_leaderboard_idx
    ON players (kybers DESC, highest_completed_level DESC, total_time_ms ASC);
