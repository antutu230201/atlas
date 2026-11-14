import { describe, expect, it } from 'vitest';
import { computeStreakStats } from '@atlas/module-dashboard';

/**
 * 成长打卡宽容断签算法单测（纯函数，无需数据库）。
 * 规则：单天空档自动桥接（每 14 天最多宽免 1 次）；连休 ≥ 2 天断签；
 * 今天未产出不断签；窗口 365 天。
 */

const day = (offset: number): string => {
  const epoch = Date.UTC(2026, 10, 14) + offset * 86_400_000;
  return new Date(epoch).toISOString().slice(0, 10);
};

const active = (offsets: number[]) => offsets.map((offset) => ({ day: day(offset), count: 1 }));

describe('成长打卡宽容断签', () => {
  it('空数据全为 0', () => {
    expect(computeStreakStats({ days: [], today: '2026-11-14' })).toEqual({
      streak: 0,
      graceUsed: 0,
      bestStreak: 0,
      lastStreak: 0,
    });
  });

  it('严格连续：今天活跃 → streak = 天数', () => {
    const stats = computeStreakStats({ days: active([-2, -1, 0]), today: '2026-11-14' });
    expect(stats.streak).toBe(3);
    expect(stats.graceUsed).toBe(0);
    expect(stats.bestStreak).toBe(3);
  });

  it('今天未产出不断签：从昨天起算', () => {
    const stats = computeStreakStats({ days: active([-3, -2, -1]), today: '2026-11-14' });
    expect(stats.streak).toBe(3);
  });

  it('单天空档桥接：链不断，当天产出照常计入', () => {
    // 活跃 -4,-3,-2；休息 -1；活跃 0 → 桥接 11-13，streak = 4（桥接日不计产出）
    const stats = computeStreakStats({ days: active([-4, -3, -2, 0]), today: '2026-11-14' });
    expect(stats.streak).toBe(4);
    expect(stats.graceUsed).toBe(1);
    expect(stats.bestStreak).toBe(4);
  });

  it('宽免冷却 14 天：冷却期内第二个空档直接断签', () => {
    // -8,-7,-6 连 3 天；-5 空档首次桥接；-4 活跃；-3 空档距上次桥接仅 2 天 → 断
    // 断后 -2 与 0 之间隔着 -1：新段首次桥接 → 当前段 = {-2, 0}，streak 2
    const stats = computeStreakStats({
      days: active([-8, -7, -6, -4, -2, 0]),
      today: '2026-11-14',
    });
    expect(stats.streak).toBe(2);
    expect(stats.graceUsed).toBe(1);
    expect(stats.bestStreak).toBe(4);
    expect(stats.lastStreak).toBe(4);
  });

  it('相距 14 天以上的空档可再次宽免', () => {
    // -40..-20（21 天）→ -19 桥接① → -18..-4（15 天）→ -3 距桥接① 16 天 → 桥接② → -2,-1,0 连续
    const offsets: number[] = [];
    for (let o = -40; o <= -20; o += 1) offsets.push(o);
    for (let o = -18; o <= -4; o += 1) offsets.push(o);
    offsets.push(-2, -1, 0);
    const stats = computeStreakStats({ days: active(offsets), today: '2026-11-14' });
    // 产出天数 = 21 + 15 + 3 = 39；两个桥接休息日不计产出
    expect(stats.streak).toBe(39);
    expect(stats.graceUsed).toBe(2);
    expect(stats.bestStreak).toBe(39);
    expect(stats.lastStreak).toBe(0);
  });

  it('连休多天后昨天刚回归：streak=1，lastStreak 为上一段', () => {
    const stats = computeStreakStats({ days: active([-10, -9, -8, -1]), today: '2026-11-14' });
    expect(stats.streak).toBe(1);
    expect(stats.lastStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it('久未产出：streak=0，lastStreak 为历史段（断签恢复提示数据源）', () => {
    const stats = computeStreakStats({ days: active([-30, -29, -28]), today: '2026-11-14' });
    expect(stats.streak).toBe(0);
    expect(stats.lastStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it('窗口边界：365 天前的记录不计入 bestStreak', () => {
    const stats = computeStreakStats({
      days: [...active([-400]), ...active([-2, -1, 0])],
      today: '2026-11-14',
    });
    expect(stats.streak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it('今天第一次产出：streak = 1，无 lastStreak', () => {
    const stats = computeStreakStats({ days: active([0]), today: '2026-11-14' });
    expect(stats.streak).toBe(1);
    expect(stats.lastStreak).toBe(0);
    expect(stats.graceUsed).toBe(0);
  });
});
