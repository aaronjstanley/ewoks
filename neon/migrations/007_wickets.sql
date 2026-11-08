ALTER TABLE players
    ADD COLUMN IF NOT EXISTS wickets integer NOT NULL DEFAULT 0
        CHECK (wickets >= 0),
    ADD COLUMN IF NOT EXISTS perfect_win_streak smallint NOT NULL DEFAULT 0
        CHECK (perfect_win_streak BETWEEN 0 AND 4);
