UPDATE players
SET highest_completed_level = highest_level - 1,
    kybers = (highest_level - 1) * 1000
        + 25 * (highest_level - 1) * highest_level / 2
WHERE highest_completed_level = 0
  AND highest_level > 1;
