import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const allowedOrigins = new Set([
  "https://aaronjstanley.github.io",
  "https://stanleystuff.com",
  "https://www.stanleystuff.com",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
]);

const groups = [
  ["Fun", "Tricky", "Taxing", "Mayhem"],
  ["Tame", "Crazy", "Wild", "Wicked", "Havoc"],
];

type Progress = {
  gameVersion: number;
  groupIndex: number;
  levelIndex: number;
};

type ScoreStats = {
  elapsedMs: number;
  speed: number;
  survivorPercentage: number;
};

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.has(origin) ? origin : "https://stanleystuff.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: cors(request) });
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 24 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

function levelNumber(progress: Progress): number | null {
  const { gameVersion, groupIndex, levelIndex } = progress;
  if (![gameVersion, groupIndex, levelIndex].every(Number.isInteger)) return null;

  if (gameVersion === 1 && groupIndex >= 0 && groupIndex < 4 && levelIndex >= 0 && levelIndex < 30) {
    return groupIndex * 30 + levelIndex + 1;
  }
  if (gameVersion === 2 && groupIndex >= 0 && groupIndex < 5 && levelIndex >= 0 && levelIndex < 20) {
    return 120 + groupIndex * 20 + levelIndex + 1;
  }
  return null;
}

function levelLabel(gameVersion: number, groupIndex: number, levelIndex: number): string {
  return `${groups[gameVersion - 1]?.[groupIndex] ?? "Level"} ${levelIndex + 1}`;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds === 0) return "—";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatLastPlayed(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function calculateKybers(completedNumber: number, progress: Progress, stats: ScoreStats): number {
  const levelValue = 1000 + completedNumber * 25;
  const versionMultiplier = progress.gameVersion === 2 ? 1.15 : 1;
  const difficultyMultiplier = 1 + progress.groupIndex * 0.1;
  const speedMultiplier = 0.97 + stats.speed * 0.03;
  const timeMultiplier = 1 + Math.max(0, 600000 - stats.elapsedMs) / 600000 * 0.5;
  const survivorMultiplier = 1 + stats.survivorPercentage / 200;
  return Math.round(
    levelValue * versionMultiplier * difficultyMultiplier * speedMultiplier * timeMultiplier *
      survivorMultiplier,
  );
}

function publicPlayer(row: Record<string, unknown>) {
  const gameVersion = Number(row.game_version);
  const groupIndex = Number(row.level_group);
  const levelIndex = Number(row.level_index);
  const scoreVersion = Number(row.score_version);
  const scoreDifficulty = Number(row.score_difficulty);
  const totalTimeMs = Number(row.total_time_ms);
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    name: row.display_name,
    highestLevel: Number(row.highest_level),
    highestCompletedLevel: Number(row.highest_completed_level),
    gameVersion,
    groupIndex,
    levelIndex,
    level: levelLabel(gameVersion, groupIndex, levelIndex),
    completedLevel:
      Number(row.highest_completed_level) > 0
        ? levelLabel(scoreVersion, scoreDifficulty, Number(row.highest_completed_level) <= 120
          ? (Number(row.highest_completed_level) - 1) % 30
          : (Number(row.highest_completed_level) - 121) % 20)
        : "Not started",
    kybers: Number(row.kybers),
    wickets: Number(row.wickets),
    totalTimeMs,
    totalTime: formatDuration(totalTimeMs),
    lastPlayedAt: formatLastPlayed(row.updated_at),
    version: scoreVersion === 2 ? "More Ewoks" : "Ewoks",
    difficulty: groups[scoreVersion - 1]?.[scoreDifficulty] ?? "Unknown",
    speed: Number(row.speed_set),
    survivorPercentage:
      row.survivor_percentage === null ? null : Number(row.survivor_percentage),
  };
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2048) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const DIAGNOSTIC_MAX_BYTES = 120_000;
const DIAGNOSTIC_KEEP = 200;

async function readDiagnosticBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > DIAGNOSTIC_MAX_BYTES) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanDiagnosticText(value: unknown, max = DIAGNOSTIC_MAX_BYTES): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 1 || value.length > max) return null;
  if (/[\u0000]/.test(value)) return null;
  return value;
}

function cleanDiagnosticField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/leaderboard") {
        const result = await pool.query(
          `SELECT display_name, highest_level, highest_completed_level, game_version,
                  level_group, level_index, kybers, total_time_ms, score_version,
                  score_difficulty, speed_set, survivor_percentage, wickets, updated_at
           FROM players
           ORDER BY kybers DESC, highest_completed_level DESC, total_time_ms ASC
           LIMIT 10`,
        );
        return json(request, { players: result.rows.map(publicPlayer) });
      }

      if (request.method === "GET" && url.pathname.startsWith("/players/")) {
        const id = decodeURIComponent(url.pathname.slice("/players/".length));
        if (!validId(id)) return json(request, { error: "Invalid player." }, 400);

        const result = await pool.query(
          `SELECT id, display_name, highest_level, highest_completed_level, game_version,
                  level_group, level_index, kybers, total_time_ms, score_version,
                  score_difficulty, speed_set, survivor_percentage, wickets, updated_at
           FROM players WHERE id = $1`,
          [id],
        );
        return result.rowCount
          ? json(request, { player: publicPlayer(result.rows[0]) })
          : json(request, { player: null });
      }

      if (request.method === "POST" && url.pathname === "/players") {
        const body = await readBody(request);
        const id = body && body.id;
        const name = body && cleanName(body.name);
        if (!validId(id)) {
          return json(request, { error: "Invalid player. Please try again." }, 400);
        }
        if (!name) {
          return json(request, { error: "Enter a name between 1 and 24 characters." }, 400);
        }

        const client = await pool.connect();
        let result;
        try {
          await client.query("BEGIN");
          result = await client.query(
            `SELECT id, display_name, highest_level, highest_completed_level, game_version,
                    level_group, level_index, kybers, total_time_ms, score_version,
                    score_difficulty, speed_set, survivor_percentage, wickets, updated_at
             FROM players
             WHERE lower(display_name) = lower($1)
             FOR UPDATE`,
            [name],
          );
          if (result.rowCount) {
            result = await client.query(
              `UPDATE players
               SET display_name = $2,
                   updated_at = now()
               WHERE id = $1
               RETURNING id, display_name, highest_level, highest_completed_level, game_version,
                         level_group, level_index, kybers, total_time_ms, score_version,
                         score_difficulty, speed_set, survivor_percentage, wickets, updated_at`,
              [result.rows[0].id, name],
            );
          } else {
            result = await client.query(
              `INSERT INTO players (id, display_name)
               VALUES ($1, $2)
               ON CONFLICT (id) DO UPDATE
                 SET display_name = EXCLUDED.display_name,
                     updated_at = now()
               RETURNING id, display_name, highest_level, highest_completed_level, game_version,
                         level_group, level_index, kybers, total_time_ms, score_version,
                         score_difficulty, speed_set, survivor_percentage, wickets, updated_at`,
              [id, name],
            );
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        return json(request, { player: publicPlayer(result.rows[0]) }, 201);
      }

      if (request.method === "POST" && url.pathname === "/progress") {
        const body = await readBody(request);
        const id = body && body.id;
        const completed = body && body.completed;
        const reached = body && body.reached;
        const elapsedMs = Number(body && body.elapsedMs);
        const speed = Number(body && body.speed);
        const survivorPercentage = Number(body && body.survivorPercentage);
        if (
          !validId(id) ||
          !completed ||
          typeof completed !== "object" ||
          !reached ||
          typeof reached !== "object" ||
          !Number.isFinite(elapsedMs) ||
          elapsedMs < 1000 ||
          elapsedMs > 86400000 ||
          !Number.isFinite(speed) ||
          speed <= 0 ||
          speed > 10 ||
          !Number.isInteger(survivorPercentage) ||
          survivorPercentage < 0 ||
          survivorPercentage > 100
        ) {
          return json(request, { error: "Invalid progress." }, 400);
        }

        const completedNumber = levelNumber(completed as Progress);
        const reachedNumber = levelNumber(reached as Progress);
        if (
          completedNumber === null ||
          reachedNumber === null ||
          reachedNumber !== Math.min(completedNumber + 1, 220)
        ) {
          return json(request, { error: "Invalid level transition." }, 400);
        }

        const next = reached as Progress;
        const completedProgress = completed as Progress;
        const kybersEarned = calculateKybers(completedNumber, completedProgress, {
          elapsedMs,
          speed,
          survivorPercentage,
        });
        const perfectClear = survivorPercentage === 100 ? 1 : 0;
        const result = await pool.query(
          `UPDATE players
           SET highest_level = GREATEST(highest_level, $2),
               highest_completed_level = $3,
               game_version = $4,
               level_group = $5,
               level_index = $6,
               kybers = kybers + $7,
               total_time_ms = total_time_ms + $8,
               score_version = $9,
               score_difficulty = $10,
               speed_set = $11,
               survivor_percentage = $12,
               wickets = wickets + CASE
                 WHEN $13 = 1 AND perfect_win_streak = 4 THEN 1
                 ELSE 0
               END,
               perfect_win_streak = CASE
                 WHEN $13 = 0 THEN 0
                 WHEN perfect_win_streak = 4 THEN 0
                 ELSE perfect_win_streak + 1
               END,
               updated_at = now()
           WHERE id = $1 AND highest_completed_level < $3
           RETURNING id, display_name, highest_level, highest_completed_level, game_version,
                     level_group, level_index, kybers, total_time_ms, score_version,
                     score_difficulty, speed_set, survivor_percentage, wickets, updated_at`,
          [
            id,
            reachedNumber,
            completedNumber,
            next.gameVersion,
            next.groupIndex,
            next.levelIndex,
            kybersEarned,
            Math.round(elapsedMs),
            completedProgress.gameVersion,
            completedProgress.groupIndex,
            speed,
            survivorPercentage,
            perfectClear,
          ],
        );

        if (!result.rowCount) {
          const current = await pool.query(
            `SELECT id, display_name, highest_level, highest_completed_level, game_version,
                    level_group, level_index, kybers, total_time_ms, score_version,
                    score_difficulty, speed_set, survivor_percentage, wickets, updated_at
             FROM players WHERE id = $1`,
            [id],
          );
          if (!current.rowCount) return json(request, { error: "Player not found." }, 404);
          return json(request, { player: publicPlayer(current.rows[0]), kybersEarned: 0 });
        }
        return json(request, { player: publicPlayer(result.rows[0]), kybersEarned });
      }

      if (request.method === "POST" && url.pathname === "/attempt") {
        const body = await readBody(request);
        const id = body && body.id;
        const attempted = body && body.attempted;
        if (!validId(id) || !attempted || typeof attempted !== "object") {
          return json(request, { error: "Invalid attempt." }, 400);
        }
        const attemptedNumber = levelNumber(attempted as Progress);
        if (attemptedNumber === null) {
          return json(request, { error: "Invalid attempt." }, 400);
        }

        const result = await pool.query(
          `UPDATE players
           SET perfect_win_streak = 0,
               updated_at = now()
           WHERE id = $1 AND highest_level = $2`,
          [id, attemptedNumber],
        );
        if (result.rowCount) return json(request, { ok: true });

        const current = await pool.query(`SELECT 1 FROM players WHERE id = $1`, [id]);
        return current.rowCount
          ? json(request, { ok: true })
          : json(request, { error: "Player not found." }, 404);
      }

      if (request.method === "POST" && url.pathname === "/wicket") {
        const body = await readBody(request);
        const id = body && body.id;
        const completed = body && body.completed;
        const reached = body && body.reached;
        if (
          !validId(id) ||
          !completed ||
          typeof completed !== "object" ||
          !reached ||
          typeof reached !== "object"
        ) {
          return json(request, { error: "Invalid Wicket shortcut." }, 400);
        }

        const completedProgress = completed as Progress;
        const next = reached as Progress;
        const completedNumber = levelNumber(completedProgress);
        const reachedNumber = levelNumber(next);
        if (
          completedNumber === null ||
          reachedNumber === null ||
          reachedNumber !== Math.min(completedNumber + 1, 220)
        ) {
          return json(request, { error: "Invalid Wicket shortcut." }, 400);
        }

        const result = await pool.query(
          `UPDATE players
           SET highest_level = GREATEST(highest_level, $2),
               highest_completed_level = $3,
               game_version = $4,
               level_group = $5,
               level_index = $6,
               score_version = $7,
               score_difficulty = $8,
               survivor_percentage = NULL,
               wickets = wickets - 1,
               perfect_win_streak = 0,
               updated_at = now()
           WHERE id = $1
             AND wickets > 0
             AND highest_level = $3
             AND highest_completed_level < $3
           RETURNING id, display_name, highest_level, highest_completed_level, game_version,
                     level_group, level_index, kybers, total_time_ms, score_version,
                     score_difficulty, speed_set, survivor_percentage, wickets, updated_at`,
          [
            id,
            reachedNumber,
            completedNumber,
            next.gameVersion,
            next.groupIndex,
            next.levelIndex,
            completedProgress.gameVersion,
            completedProgress.groupIndex,
          ],
        );

        if (!result.rowCount) {
          const current = await pool.query(
            `SELECT wickets FROM players WHERE id = $1`,
            [id],
          );
          if (!current.rowCount) return json(request, { error: "Player not found." }, 404);
          if (Number(current.rows[0].wickets) < 1) {
            return json(request, { error: "You do not have a Wicket to use." }, 409);
          }
          return json(request, { error: "That level is already complete." }, 409);
        }

        return json(request, { player: publicPlayer(result.rows[0]), kybersEarned: 0 });
      }

      if (request.method === "POST" && url.pathname === "/diagnostics") {
        const body = await readDiagnosticBody(request);
        if (!body) {
          return json(request, { error: "Diagnostic payload too large or invalid." }, 400);
        }

        const dumpText = cleanDiagnosticText(body.dump);
        const sessionId = cleanDiagnosticField(body.sessionId, 64);
        if (!dumpText || !sessionId) {
          return json(request, { error: "Invalid diagnostic log." }, 400);
        }

        const playerName = cleanDiagnosticField(body.playerName, 24);
        const pagePath = cleanDiagnosticField(body.pagePath, 200);
        const userAgent = cleanDiagnosticField(body.userAgent, 300);
        const entryCount = Number.isFinite(Number(body.entryCount))
          ? Math.max(0, Math.min(1000, Math.round(Number(body.entryCount))))
          : 0;

        const updated = await pool.query(
          `UPDATE diagnostic_logs
           SET player_name = $2,
               page_path = $3,
               user_agent = $4,
               dump_text = $5,
               entry_count = $6,
               created_at = now()
           WHERE session_id = $1
           RETURNING id, session_id, player_name, page_path, entry_count, created_at`,
          [sessionId, playerName, pagePath, userAgent, dumpText, entryCount],
        );

        const inserted = updated.rowCount
          ? updated
          : await pool.query(
              `INSERT INTO diagnostic_logs
                 (session_id, player_name, page_path, user_agent, dump_text, entry_count)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, session_id, player_name, page_path, entry_count, created_at`,
              [sessionId, playerName, pagePath, userAgent, dumpText, entryCount],
            );

        await pool.query(
          `DELETE FROM diagnostic_logs d
           WHERE d.id NOT IN (
             SELECT keep.id FROM (
               SELECT id FROM diagnostic_logs
               ORDER BY created_at DESC, id DESC
               LIMIT $1
             ) keep
           )`,
          [DIAGNOSTIC_KEEP],
        );

        const row = inserted.rows[0];
        return json(request, {
          id: Number(row.id),
          sessionId: row.session_id,
          playerName: row.player_name,
          pagePath: row.page_path,
          entryCount: Number(row.entry_count),
          createdAt: formatLastPlayed(row.created_at),
        });
      }

      if (request.method === "GET" && url.pathname === "/diagnostics") {
        const result = await pool.query(
          `SELECT id, session_id, player_name, page_path, entry_count, created_at
           FROM diagnostic_logs
           ORDER BY created_at DESC, id DESC
           LIMIT 50`,
        );
        return json(request, {
          logs: result.rows.map((row) => ({
            id: Number(row.id),
            sessionId: row.session_id,
            playerName: row.player_name,
            pagePath: row.page_path,
            entryCount: Number(row.entry_count),
            createdAt: formatLastPlayed(row.created_at),
          })),
        });
      }

      if (request.method === "GET" && url.pathname === "/diagnostics/latest") {
        const result = await pool.query(
          `SELECT dump_text FROM diagnostic_logs
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
        );
        if (!result.rowCount) {
          return new Response("No diagnostic logs yet.\n", {
            status: 404,
            headers: {
              ...cors(request),
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }
        return new Response(String(result.rows[0].dump_text), {
          status: 200,
          headers: {
            ...cors(request),
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      if (request.method === "GET" && url.pathname.startsWith("/diagnostics/")) {
        const idText = decodeURIComponent(url.pathname.slice("/diagnostics/".length));
        if (!/^\d+$/.test(idText)) {
          return json(request, { error: "Invalid diagnostic id." }, 400);
        }
        const result = await pool.query(
          `SELECT dump_text FROM diagnostic_logs WHERE id = $1`,
          [Number(idText)],
        );
        if (!result.rowCount) {
          return json(request, { error: "Diagnostic log not found." }, 404);
        }
        return new Response(String(result.rows[0].dump_text), {
          status: 200,
          headers: {
            ...cors(request),
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      return json(request, { error: "Not found." }, 404);
    } catch (error) {
      console.error(error);
      return json(request, { error: "The forest network is unavailable." }, 500);
    }
  },
};
