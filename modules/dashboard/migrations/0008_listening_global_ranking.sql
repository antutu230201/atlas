-- 全站听歌排名（ADR-0008：一人一号一大屏，排名面向系统全部注册用户）。
-- SECURITY DEFINER 以迁移属主身份执行，绕过 listening_daily 的租户 RLS 完成跨空间聚合；
-- 仅暴露聚合结果（user_id/名称快照/秒数），不泄露行级数据。
CREATE OR REPLACE FUNCTION platform.listening_ranking_global(start_day date, end_day date, max_rows int)
RETURNS TABLE (user_id uuid, user_name text, seconds bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = platform, "modules.dashboard", public
AS $$
  SELECT l.user_id, max(l.user_name) AS user_name, sum(l.seconds)::bigint AS seconds
  FROM "modules.dashboard".listening_daily l
  WHERE l.day >= start_day AND l.day <= end_day
  GROUP BY l.user_id
  ORDER BY sum(l.seconds) DESC
  LIMIT max_rows;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform.listening_ranking_global(date, date, int) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform.listening_ranking_global(date, date, int) TO atlas_app;
