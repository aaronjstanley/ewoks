ALTER TABLE players
    ADD COLUMN IF NOT EXISTS survivor_percentage smallint NOT NULL DEFAULT 0
        CHECK (survivor_percentage BETWEEN 0 AND 100);
