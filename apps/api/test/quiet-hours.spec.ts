import { describe, expect, it } from 'vitest';
import {
  QUIET_HOURS_DEFAULT,
  isQuietNow,
  normalizeQuietHours,
  quietHoursSchema,
} from '../src/events/quiet-hours';

const at = (h: number, m: number) => new Date(2026, 10, 15, h, m, 0);

describe('isQuietNow', () => {
  it('未启用时任何时间都不免打扰', () => {
    const pref = { enabled: false, start: '22:00', end: '08:00' };
    expect(isQuietNow(pref, at(23, 0))).toBe(false);
    expect(isQuietNow(pref, at(12, 0))).toBe(false);
  });

  it('同日窗口：含开始、不含结束点', () => {
    const pref = { enabled: true, start: '10:00', end: '12:00' };
    expect(isQuietNow(pref, at(9, 59))).toBe(false);
    expect(isQuietNow(pref, at(10, 0))).toBe(true);
    expect(isQuietNow(pref, at(11, 30))).toBe(true);
    expect(isQuietNow(pref, at(12, 0))).toBe(false);
  });

  it('跨午夜窗口（22:00–08:00）：两侧都判中', () => {
    const pref = { enabled: true, start: '22:00', end: '08:00' };
    expect(isQuietNow(pref, at(21, 59))).toBe(false);
    expect(isQuietNow(pref, at(22, 0))).toBe(true);
    expect(isQuietNow(pref, at(23, 59))).toBe(true);
    expect(isQuietNow(pref, at(3, 15))).toBe(true);
    expect(isQuietNow(pref, at(7, 59))).toBe(true);
    expect(isQuietNow(pref, at(8, 0))).toBe(false);
  });

  it('缺省使用本地时间', () => {
    const pref = { enabled: true, start: '00:00', end: '23:59' };
    expect(isQuietNow(pref)).toBe(true);
  });
});

describe('normalizeQuietHours', () => {
  it('缺失/垃圾数据回落默认（关闭，22:00–08:00）', () => {
    expect(normalizeQuietHours(undefined)).toEqual(QUIET_HOURS_DEFAULT);
    expect(normalizeQuietHours('nonsense')).toEqual(QUIET_HOURS_DEFAULT);
    expect(normalizeQuietHours({ enabled: 'yes', start: 22, end: null })).toEqual(
      QUIET_HOURS_DEFAULT,
    );
  });

  it('逐字段回落：坏时间项替换为默认，好字段保留', () => {
    expect(normalizeQuietHours({ enabled: true, start: '23:30', end: 'bad' })).toEqual({
      enabled: true,
      start: '23:30',
      end: QUIET_HOURS_DEFAULT.end,
    });
  });

  it('start==end 的旧数据回落默认（避免全天空窗歧义）', () => {
    expect(normalizeQuietHours({ enabled: true, start: '08:00', end: '08:00' })).toEqual(
      QUIET_HOURS_DEFAULT,
    );
  });
});

describe('quietHoursSchema', () => {
  it('接受合法跨午夜窗口', () => {
    expect(
      quietHoursSchema.safeParse({ enabled: true, start: '23:30', end: '07:00' }).success,
    ).toBe(true);
  });

  it('拒绝坏格式与相同起止', () => {
    expect(
      quietHoursSchema.safeParse({ enabled: true, start: '24:00', end: '07:00' }).success,
    ).toBe(false);
    expect(quietHoursSchema.safeParse({ enabled: true, start: '8:00', end: '07:00' }).success).toBe(
      false,
    );
    expect(
      quietHoursSchema.safeParse({ enabled: true, start: '08:00', end: '08:00' }).success,
    ).toBe(false);
    expect(
      quietHoursSchema.safeParse({ enabled: 'yes', start: '08:00', end: '09:00' }).success,
    ).toBe(false);
  });
});
