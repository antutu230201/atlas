import { sql } from 'drizzle-orm';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Db } from '../db/client';
import { ADMIN_DB_TOKEN, ENV_TOKEN, NOTIFICATION_SERVICE_TOKEN } from '../tokens';
import { Inject } from '@nestjs/common';
import type { NotificationService } from '../events/notification.service';
import type { ApiEnv } from '../env';

/**
 * 听歌周报调度器（ADR-0007/0008 延伸）：
 * 每分钟检查一次；当进入一个新的 ISO 周时（无论服务器是否在周一当天运行，
 * 首个触达的 tick 自愈补发），为上一个自然周（周一~周日）有过听歌的
 * 全系统用户生成周报并发送到通知中心。
 *
 * 状态持久化在 platform.scheduler_state（无租户语义，服务端专用）；
 * 聚合经 SECURITY DEFINER 函数 platform.listening_weekly_report（仅聚合结果，不泄露行级数据）。
 * 测试开关：ATLAS_WEEKLY_REPORT_FORCE=1 时每次进程运行强制发一次（忽略周次判断）。
 */

const STATE_KEY = 'listening_weekly:last_sent_week';
const TICK_MS = 60_000;
const MAX_ROWS = 500;

interface WeeklyReportRow {
  out_user_id: string;
  out_user_name: string;
  out_workspace_id: string;
  out_seconds: string | number;
  out_plays: string | number;
  out_top_title: string | null;
  out_top_artist: string | null;
}

/** ISO 周键（周四所属年 + 周序号），如 2026-W45 */
function isoWeekKey(date: Date): string {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const isoYear = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4Day + 3);
  const week = 1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** 上一个自然周（周一~周日）的日期范围 */
function lastIsoWeekRange(date: Date): { start: string; end: string } {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = (t.getDay() + 6) % 7;
  const thisMonday = new Date(t);
  thisMonday.setDate(t.getDate() - dayNum);
  const start = new Date(thisMonday);
  start.setDate(thisMonday.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: ymd(start), end: ymd(end) };
}

function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

@Injectable()
export class WeeklyReportScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private forcedSent = false;

  constructor(
    @Inject(ADMIN_DB_TOKEN) private readonly adminDb: Db,
    @Inject(NOTIFICATION_SERVICE_TOKEN) private readonly notifications: NotificationService,
    @Inject(ENV_TOKEN) private readonly env: ApiEnv,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const force = process.env.ATLAS_WEEKLY_REPORT_FORCE === '1';
    const weekKey = isoWeekKey(new Date());
    try {
      if (force) {
        if (this.forcedSent) return; // 强制模式每次进程只发一轮
      } else {
        const state = await this.adminDb.execute(
          sql`select value from platform.scheduler_state where key = ${STATE_KEY}`,
        );
        const lastSent = (state.rows as Array<{ value: string }>)[0]?.value;
        if (lastSent === weekKey) return; // 本周已发过
      }

      const { start, end } = lastIsoWeekRange(new Date());
      const result = await this.adminDb.execute(
        sql`select * from platform.listening_weekly_report(${start}::date, ${end}::date, ${MAX_ROWS})`,
      );
      const rows = result.rows as unknown as WeeklyReportRow[];
      for (const [index, row] of rows.entries()) {
        const seconds = Number(row.out_seconds ?? 0);
        const rank = index + 1;
        const top = row.out_top_title ? `，最常听《${row.out_top_title}》` : '';
        try {
          await this.notifications.create({
            workspaceId: row.out_workspace_id,
            userId: row.out_user_id,
            type: 'listening.weekly',
            title: `听歌周报：上周 ${formatMinutes(seconds)}${top}`,
            body: {
              text: `全站第 ${rank} 名（共 ${rows.length} 人参与）· 播放 ${Number(row.out_plays ?? 0)} 次`,
              link: '/m/dashboard/listening',
              weekStart: start,
              weekEnd: end,
            },
          });
        } catch (error) {
          // 单个用户失败不阻断整轮（下一周次仍会正常生成）
          console.error('[weekly-report] 通知写入失败:', error);
        }
      }

      await this.adminDb.execute(
        sql`insert into platform.scheduler_state (key, value, updated_at)
            values (${STATE_KEY}, ${weekKey}, now())
            on conflict (key) do update set value = ${weekKey}, updated_at = now()`,
      );
      if (force) this.forcedSent = true;
      console.log(
        `[weekly-report] 上周听歌周报已生成（${rows.length} 位用户，窗口 ${start} ~ ${end}）`,
      );
    } catch (error) {
      // 整轮失败：下个 tick 重试（状态未写入，幂等）
      console.error('[weekly-report] 周报生成失败，将在下个周期重试:', error);
    }
  }
}
