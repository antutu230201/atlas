/** 免打扰时段：与服务端 quiet-hours.ts 同语义的客户端判定（本地时钟，窗口跨午夜） */

export interface QuietHours {
  enabled: boolean;
  /** "HH:mm"，24 小时制；允许跨午夜（如 22:00–08:00） */
  start: string;
  end: string;
}

export const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 分钟数比较：窗口不含结束点（与服务端一致，08:00 整点视为已出免打扰） */
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
