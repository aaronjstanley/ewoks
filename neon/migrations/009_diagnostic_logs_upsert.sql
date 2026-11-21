DELETE FROM diagnostic_logs a
USING diagnostic_logs b
WHERE a.session_id = b.session_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS diagnostic_logs_session_id_uidx
    ON diagnostic_logs (session_id);
