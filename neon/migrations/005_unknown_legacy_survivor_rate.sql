ALTER TABLE players
    ALTER COLUMN survivor_percentage DROP NOT NULL,
    ALTER COLUMN survivor_percentage DROP DEFAULT;

UPDATE players
SET survivor_percentage = NULL
WHERE survivor_percentage = 0
  AND highest_completed_level > 0;
