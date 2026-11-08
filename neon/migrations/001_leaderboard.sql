CREATE TABLE IF NOT EXISTS players (
    id uuid PRIMARY KEY,
    display_name varchar(24) NOT NULL,
    highest_level smallint NOT NULL DEFAULT 1 CHECK (highest_level BETWEEN 1 AND 220),
    game_version smallint NOT NULL DEFAULT 1 CHECK (game_version BETWEEN 1 AND 2),
    level_group smallint NOT NULL DEFAULT 0,
    level_index smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_leaderboard_idx
    ON players (highest_level DESC, updated_at ASC);
