-- 内部调度状态（服务端专用：无租户语义、不启用 RLS；atlas_app 经默认权限获得增删改查）
CREATE TABLE "platform"."scheduler_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 听歌周报聚合（ADR-0008：面向全系统注册用户；SECURITY DEFINER 绕过模块 RLS，仅暴露聚合结果）
-- OUT 参数统一加 out_ 前缀，避免与表列名冲突导致 SQL 函数内参数替换歧义
CREATE OR REPLACE FUNCTION platform.listening_weekly_report(start_day date, end_day date, max_rows int)
RETURNS TABLE (out_user_id uuid, out_user_name text, out_workspace_id uuid, out_seconds bigint, out_plays bigint, out_top_title text, out_top_artist text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = platform, "modules.dashboard", public
AS $$
  WITH per_user AS (
    SELECT l.user_id, max(l.user_name) AS max_user_name, sum(l.seconds)::bigint AS total_seconds, sum(l.plays)::bigint AS total_plays
    FROM "modules.dashboard".listening_daily l
    WHERE l.day >= start_day AND l.day <= end_day
    GROUP BY l.user_id
  ),
  per_user_ws AS (
    SELECT l.user_id, l.workspace_id, sum(l.seconds)::bigint AS ws_seconds
    FROM "modules.dashboard".listening_daily l
    WHERE l.day >= start_day AND l.day <= end_day
    GROUP BY l.user_id, l.workspace_id
  ),
  main_ws AS (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.workspace_id
    FROM per_user_ws p
    ORDER BY p.user_id, p.ws_seconds DESC
  ),
  per_song AS (
    SELECT l.user_id, l.song_title, l.song_artist, sum(l.seconds)::bigint AS song_seconds
    FROM "modules.dashboard".listening_daily l
    WHERE l.day >= start_day AND l.day <= end_day
    GROUP BY l.user_id, l.song_id, l.song_title, l.song_artist
  ),
  top_song AS (
    SELECT DISTINCT ON (s.user_id) s.user_id, s.song_title, s.song_artist
    FROM per_song s
    ORDER BY s.user_id, s.song_seconds DESC
  )
  SELECT p.user_id, p.max_user_name, m.workspace_id, p.total_seconds, p.total_plays, t.song_title, t.song_artist
  FROM per_user p
  JOIN main_ws m ON m.user_id = p.user_id
  LEFT JOIN top_song t ON t.user_id = p.user_id
  ORDER BY p.total_seconds DESC
  LIMIT max_rows;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform.listening_weekly_report(date, date, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform.listening_weekly_report(date, date, int) TO atlas_app;
