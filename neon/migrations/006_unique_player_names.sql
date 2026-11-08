DELETE FROM players older
USING players newer
WHERE lower(older.display_name) = lower(newer.display_name)
  AND (
    older.updated_at < newer.updated_at
    OR (older.updated_at = newer.updated_at AND older.id < newer.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS players_display_name_unique_idx
    ON players (lower(display_name));
