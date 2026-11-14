import { z } from 'zod';

/**
 * 通知免打扰时段（宪法 §5 输入校验；纯函数便于单测）。
 * 偏好持久化在 user.settings.notificationQuietHours（jsonb，无需迁移）。
 */

export const QUIET_HOURS_KEY = 'notificationQuietHours';

export interface QuietHours {
  enabled: boolean;
  /** "HH:mm"，24 小时制；允许跨午夜（如 22:00–08:00） */
  start: string;
  end: string;
}

export const QUIET_HOURS_DEFAULT: QuietHours = { enabled: false, start: '22:00', end: '08:00' };

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const quietHoursSchema = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(HH_MM, '开始时间必须是 HH:mm（24 小时制）'),
    end: z.string().regex(HH_MM, '结束时间必须是 HH:mm（24 小时制）'),
  })
  .refine((value) => value.start !== value.end, {
    message: '开始与结束时间不能相同',
    path: ['start'],
  });

/** 从 user.settings 读偏好：非法/缺失字段逐项回落默认值（旧数据兼容） */
export function normalizeQuietHours(raw: unknown): QuietHours {
  if (!raw || typeof raw !== 'object') return QUIET_HOURS_DEFAULT;
  const candidate = raw as Partial<Record<keyof QuietHours, unknown>>;
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : false;
  const start =
    typeof candidate.start === 'string' && HH_MM.test(candidate.start)
      ? candidate.start
      : QUIET_HOURS_DEFAULT.start;
  const end =
    typeof candidate.end === 'string' && HH_MM.test(candidate.end)
      ? candidate.end
      : QUIET_HOURS_DEFAULT.end;
  if (start === end) return QUIET_HOURS_DEFAULT;
  return { enabled, start, end };
}

/** 分钟数比较：窗口不含结束点（08:00 整点视为已出免打扰） */
export function isQuietNow(pref: QuietHours, now: Date = new Date()): boolean {
  if (!pref.enabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = pref.start.split(':').map(Number) as [number, number];
  const [eh, em] = pref.end.split(':').map(Number) as [number, number];
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  if (startM < endM) return minutes >= startM && minutes < endM;
  // 跨午夜（如 22:00–08:00）： >= 开始 或 < 结束
  return minutes >= startM || minutes < endM;
}
