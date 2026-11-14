/**
 * 成长打卡连续统计（宽容型断签，纯函数便于测试）。
 *
 * 规则（2026-11-14 迭代，roadmap「宽容型断签机制」）：
 * - 连续记录中允许"休息 1 天"：单天空档（前后都有产出）自动桥接，休息日不计产出、不断签；
 * - 宽免有冷却：距上次宽免不足 14 天的空档直接断签（防"隔天打卡"无限续链）；
 * - 连休 ≥ 2 天必断签；
 * - 今天尚未产出不断签（今天还没结束），从昨天起算——沿用既有 UX。
 */

export interface StreakInput {
  /** 活跃日（仅 count > 0 的日子），day 格式 YYYY-MM-DD */
  days: Array<{ day: string; count: number }>;
  /** 本地时区今天，YYYY-MM-DD */
  today: string;
  /** 统计窗口天数（默认 365） */
  windowDays?: number;
}

export interface StreakStats {
  /** 宽容连续天数（当前段内活跃天数，桥接的休息日不计入） */
  streak: number;
  /** 当前连续段中已使用的宽免次数 */
  graceUsed: number;
  /** 窗口内最长连续段（同样按宽容口径计） */
  bestStreak: number;
  /** 上一段已结束的连续段长度（断签恢复提示用；无则 0） */
  lastStreak: number;
}

/** 宽免冷却期：两次桥接之间至少间隔 14 天 */
const GRACE_INTERVAL_DAYS = 14;

const DAY_MS = 86_400_000;

function parseDay(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year!, (month ?? 1) - 1, date ?? 1) / DAY_MS;
}

function epochToDay(epochDays: number): string {
  return new Date(epochDays * DAY_MS).toISOString().slice(0, 10);
}

function diffDays(later: string, earlier: string): number {
  return Math.round(parseDay(later) - parseDay(earlier));
}

interface Run {
  /** 段内活跃天数（桥接的休息日不计入） */
  length: number;
  /** 段内最后一个活跃日 */
  lastActive: string;
  /** 上一次桥接的空档日（null = 本段尚未宽免过） */
  lastBridge: string | null;
  /** 段内累计宽免次数 */
  graces: number;
}

/** 正向扫描日历，按宽容口径切分连续段 */
function scanRuns(done: Set<string>, windowStart: string, today: string): Run[] {
  const runs: Run[] = [];
  let run: Run | null = null;

  const start = parseDay(windowStart);
  const end = parseDay(today);
  for (let epoch = start; epoch <= end; epoch += 1) {
    const day = epochToDay(epoch);
    if (!done.has(day)) continue;

    if (!run) {
      run = { length: 1, lastActive: day, lastBridge: null, graces: 0 };
      continue;
    }
    const gap = diffDays(day, run.lastActive);
    if (gap === 1) {
      run.length += 1;
      run.lastActive = day;
    } else if (gap === 2) {
      const gapDay = epochToDay(epoch - 1);
      const cooled =
        run.lastBridge === null || diffDays(gapDay, run.lastBridge) >= GRACE_INTERVAL_DAYS;
      if (cooled) {
        // 宽免这个休息日：链不断；当天产出照常计入
        run.lastBridge = gapDay;
        run.graces += 1;
        run.length += 1;
        run.lastActive = day;
      } else {
        runs.push(run);
        run = { length: 1, lastActive: day, lastBridge: null, graces: 0 };
      }
    } else {
      runs.push(run);
      run = { length: 1, lastActive: day, lastBridge: null, graces: 0 };
    }
  }
  if (run) runs.push(run);
  return runs;
}

export function computeStreakStats({ days, today, windowDays = 365 }: StreakInput): StreakStats {
  const done = new Set(days.filter((d) => d.count > 0).map((d) => d.day));
  const windowStart = epochToDay(parseDay(today) - (windowDays - 1));
  const runs = scanRuns(done, windowStart, today);

  if (runs.length === 0) {
    return { streak: 0, graceUsed: 0, bestStreak: 0, lastStreak: 0 };
  }

  const last: Run | undefined = runs[runs.length - 1];
  if (!last) {
    return { streak: 0, graceUsed: 0, bestStreak: 0, lastStreak: 0 };
  }
  const isActiveToday = done.has(today);
  // 当前段：段尾是今天；或今天尚未产出、段尾是昨天（今天还没结束，不断签）
  const isCurrent =
    (isActiveToday && last.lastActive === today) ||
    (!isActiveToday && diffDays(today, last.lastActive) === 1);

  const streak = isCurrent ? last.length : 0;
  const graceUsed = isCurrent ? last.graces : 0;
  const bestStreak = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const previous: Run | undefined = runs[runs.length - 2];
  const lastStreak = isCurrent ? (previous?.length ?? 0) : last.length;

  return { streak, graceUsed, bestStreak, lastStreak };
}
