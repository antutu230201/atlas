import { sql } from 'drizzle-orm';
import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Db } from '../db/client';
import { ADMIN_DB_TOKEN, AI_ADAPTER_TOKEN, NOTIFICATION_SERVICE_TOKEN } from '../tokens';
import type { NotificationService } from '../events/notification.service';
import { ConfigurableAIProvider } from '../ai/ai-config.service';

/**
 * 每日回顾调度器：
 * 每天本地时间 23 点（每分钟 tick 检查，进入 23 点窗口且当天未发过即执行，
 * 错过窗口则当天不发——回顾价值集中在当晚，补发"昨天的日报"反而像催促）。
 * 汇总当天有动态的（user, workspace）：完成待办数 + 听歌分钟 + 打卡次数，
 * 至少有一项活动才推送（安静的晚上不催）；链接回大屏看 AI 小结与热榜。
 *
 * 状态持久化在 platform.scheduler_state；纯 SQL 聚合，不跨模块调代码（架构铁律 §5）。
 * 测试开关：ATLAS_DAILY_REPORT_FORCE=1 时每次进程运行强制发一次。
 */

const STATE_KEY = 'daily_rollup:last_sent_day';
const TICK_MS = 60_000;
const MAX_MEMBERS = 500;

interface MemberRow {
  user_id: string;
  display_name: string;
  workspace_id: string;
  todos_done: string | number;
  listening_seconds: string | number;
  activity_count: string | number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class DailyReportScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private forcedSent = false;

  constructor(
    @Inject(ADMIN_DB_TOKEN) private readonly adminDb: Db,
    @Inject(NOTIFICATION_SERVICE_TOKEN) private readonly notifications: NotificationService,
    @Inject(AI_ADAPTER_TOKEN) private readonly ai: ConfigurableAIProvider,
  ) {}

  /** AI 晚间回顾语：真实供应商才生成，失败静默——日报本身不依赖 AI */
  private async aiEveningNote(parts: string[]): Promise<string | null> {
    if (!this.ai.config || parts.length === 0) return null;
    try {
      const result = await this.ai.complete({
        prompt: `用户今天：${parts.join('，')}。现在是晚上，请用一句话（30 字内）温和地收尾这一天，像朋友道晚安，不罗列数字。`,
        maxTokens: 80,
        temperature: 0.8,
      });
      const text = result.text.trim();
      return text.length > 0 && text.length <= 100 ? text : null;
    } catch {
      return null;
    }
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const force = process.env.ATLAS_DAILY_REPORT_FORCE === '1';
    const now = new Date();
    if (!force && now.getHours() !== 23) return; // 只在 23 点窗口跑
    const day = todayKey();
    try {
      if (force) {
        if (this.forcedSent) return;
      } else {
        const state = await this.adminDb.execute(
          sql`select value from platform.scheduler_state where key = ${STATE_KEY}`,
        );
        const lastSent = (state.rows as Array<{ value: string }>)[0]?.value;
        if (lastSent === day) return;
      }

      const result = await this.adminDb.execute(sql`
        select m.user_id,
               u.display_name,
               m.workspace_id,
               (select count(*) from "modules.todo_notes".todo t
                 where t.workspace_id = m.workspace_id
                   and t.created_by = m.user_id
                   and t.deleted_at is null
                   and t.status = 'done'
                   and (t.updated_at at time zone current_setting('TimeZone'))::date = current_date) as todos_done,
               (select coalesce(sum(l.seconds), 0) from "modules.dashboard".listening_daily l
                 where l.workspace_id = m.workspace_id
                   and l.user_id = m.user_id
                   and l.day = current_date) as listening_seconds,
               (select coalesce(sum(a.count), 0) from "modules.dashboard".activity a
                 where a.workspace_id = m.workspace_id
                   and a.day = current_date) as activity_count
        from platform.workspace_member m
        join platform."user" u on u.id = m.user_id
        limit ${MAX_MEMBERS}
      `);
      const rows = result.rows as unknown as MemberRow[];
      let sent = 0;
      for (const row of rows) {
        const todosDone = Number(row.todos_done ?? 0);
        const minutes = Math.round(Number(row.listening_seconds ?? 0) / 60);
        const activity = Number(row.activity_count ?? 0);
        // 全安静的晚上不发：日报是回顾，不是打卡考勤
        if (todosDone === 0 && minutes === 0 && activity === 0) continue;
        const parts: string[] = [];
        if (todosDone > 0) parts.push(`完成 ${todosDone} 件待办`);
        if (minutes > 0) parts.push(`听了 ${minutes} 分钟歌`);
        if (activity > 0) parts.push(`打卡 ${activity} 次`);
        // AI 晚间回顾：真实供应商才生成，失败回落固定文案
        const eveningNote = await this.aiEveningNote(parts);
        const tail = eveningNote ?? '去看看今天的小结吧。';
        try {
          await this.notifications.create({
            workspaceId: row.workspace_id,
            userId: row.user_id,
            type: 'system.daily',
            title: '今日回顾',
            body: {
              text: `${parts.join(' · ')}。${tail}`,
              link: '/',
              day,
            },
          });
          sent += 1;
        } catch (error) {
          console.error('[daily-report] 通知写入失败:', error);
        }
      }

      await this.adminDb.execute(
        sql`insert into platform.scheduler_state (key, value, updated_at)
            values (${STATE_KEY}, ${day}, now())
            on conflict (key) do update set value = ${day}, updated_at = now()`,
      );
      if (force) this.forcedSent = true;
      console.log(`[daily-report] ${day} 日报已生成（${sent} 位用户）`);
    } catch (error) {
      // 整轮失败：下个 tick 重试（状态未写入，幂等）
      console.error('[daily-report] 日报生成失败，将在下个周期重试:', error);
    }
  }
}
