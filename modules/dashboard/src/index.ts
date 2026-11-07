import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ModuleActionError,
  moduleManifestSchema,
  type ModuleContext,
  type ModuleDefinition,
} from '@atlas/sdk';
import { activity, countdown, listeningDaily, sourceCache } from './db/schema';
import { HOT_SOURCES, getHotSource, type HotItem } from './providers/hotlists';
import {
  fetchWeather,
  geocodeCity,
  type CitySuggestion,
  type WeatherData,
} from './providers/weather';
import {
  detectLocationByIp,
  fetchQuote,
  fetchWallpaper,
  type DetectedLocation,
  type Quote,
  type Wallpaper,
} from './providers/misc';
import { isFakeMode } from './providers/http';
import { fetchNeteaseLyrics } from './providers/lyrics';
import {
  fetchLikedTracks,
  fetchProfile,
  fetchSongUrl,
  qrCheck,
  qrUnikey,
  type NeteaseTrack,
} from './providers/netease';
import { open as openSealed, seal as sealSecret } from './providers/secret-box';
import { neteaseBinding } from './db/schema';
import {
  fakeLocation,
  fakeLyrics,
  fakeQuote,
  fakeWallpaper,
  fakeWeather,
} from './providers/fixtures';

/**
 * 个人大屏（dashboard）：时钟/农历、天气、多源热榜、滚动头条、一言、倒计时、氛围壁纸。
 * 外部请求一律在服务端发起（绕开浏览器 CORS），结果落 source_cache（带 TTL 的落库快照）：
 * 未过期直接回缓存；过期则重新拉取，失败回退旧值（stale），无旧值才报 error。
 */

const manifest = moduleManifestSchema.parse({
  name: 'dashboard',
  version: '0.1.0',
  title: '个人大屏',
  description: '时钟农历、天气、多源热榜、滚动头条、一言、倒计时与氛围壁纸的每日入口。',
  permissions: ['dashboard:read', 'dashboard:write'],
  dependsOn: [],
  routes: [
    { path: 'screen', title: '大屏', nav: { order: 0, icon: '🖥️' } },
    { path: 'listening', title: '听歌统计', nav: { order: 1, icon: '🎵' } },
  ],
  settings: [],
  events: {
    publishes: [
      'dashboard.countdown.created',
      'dashboard.countdown.updated',
      'dashboard.countdown.deleted',
      'dashboard.countdown.restored',
      'dashboard.netease.bound',
      'dashboard.netease.unbound',
    ],
    // 事件总线订阅（模块间唯一数据通道，不直读 todo_notes 表）：完成待办 = 成长打卡
    subscribes: [{ event: 'todo.completed', handler: 'onTodoCompleted' }],
  },
  migrations: 'migrations',
});

/* ---------------- 设置与输入校验 ---------------- */

const citySchema = z.object({
  name: z.string().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const settingsSchema = z.object({
  city: citySchema.nullable().optional(),
  sources: z.record(z.string(), z.boolean()).optional(),
  wallpaper: z.boolean().optional(),
});

type WorkspaceSettings = z.infer<typeof settingsSchema>;

const createCountdownSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(60),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  pinned: z.boolean().optional(),
});

const updateCountdownSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(60).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  pinned: z.boolean().optional(),
});

const refreshSchema = z.object({ sources: z.array(z.string().max(40)).max(10).optional() });
const searchCitySchema = z.object({ q: z.string().min(1, '请输入城市名').max(60) });
const lyricsSchema = z.object({ id: z.number().int().positive() });
const neteaseSongUrlSchema = z.object({ id: z.number().int().positive() });
const listeningHeartbeatSchema = z.object({
  songId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  artist: z.string().max(200),
  cover: z.string().max(500).optional(),
  seconds: z.number().int().min(1).max(120),
  first: z.boolean().optional(),
});
type ListeningRange = 'day' | 'lastWeek' | 'week' | 'month' | 'year';
const listeningRangeSchema = z.object({
  range: z.enum(['day', 'lastWeek', 'week', 'month', 'year']),
  /** 向前平移的周期数（0=当前窗口，1=上一周期），报告环比用 */
  offset: z.number().int().min(0).max(24).optional(),
});
/** unikey 为网易云签发的 uuid；只用于轮询，不落库 */
const neteaseQrPollSchema = z.object({ unikey: z.string().min(10).max(64) });

/** 当前用户在本工作空间的活跃绑定（含解密 cookie；仅限模块内使用，绝不进返回值/日志） */
async function activeBinding(ctx: ModuleContext) {
  const rows = await ctx.db
    .select()
    .from(neteaseBinding)
    .where(
      and(
        eq(neteaseBinding.workspaceId, ctx.workspaceId),
        eq(neteaseBinding.userId, ctx.userId),
        isNull(neteaseBinding.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, cookie: openSealed(row.cookieSealed) };
}

function bad(message: string): never {
  throw new ModuleActionError(`输入不合法：${message}`);
}

function parseSettings(raw: Record<string, unknown>): WorkspaceSettings {
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/* ---------------- 数据源信封与缓存 ---------------- */

export interface SourceEnvelope<T> {
  /** fresh=缓存内 fresh=本次新拉取；stale=拉取失败回退旧值；error=无旧值可用；empty=未配置（如未选城市） */
  status: 'fresh' | 'stale' | 'error' | 'empty';
  fetchedAt: string | null;
  payload: T | null;
  error?: string;
}

interface CacheRow {
  payload: unknown;
  fetchedAt: Date;
}

const EMPTY_TTL_MS = 10 * 60_000;

function weatherCacheKey(city: { lat: number; lon: number }): string {
  return `weather:${city.lat.toFixed(3)},${city.lon.toFixed(3)}`;
}

async function readCache(ctx: ModuleContext, key: string): Promise<CacheRow | null> {
  const rows = await ctx.db
    .select({ payload: sourceCache.payload, fetchedAt: sourceCache.fetchedAt })
    .from(sourceCache)
    .where(and(eq(sourceCache.workspaceId, ctx.workspaceId), eq(sourceCache.sourceKey, key)))
    .limit(1);
  return rows[0] ?? null;
}

async function writeCache(ctx: ModuleContext, key: string, payload: unknown): Promise<void> {
  const now = new Date();
  await ctx.db
    .insert(sourceCache)
    .values({ workspaceId: ctx.workspaceId, sourceKey: key, payload, fetchedAt: now })
    .onConflictDoUpdate({
      target: [sourceCache.workspaceId, sourceCache.sourceKey],
      set: { payload, fetchedAt: now, updatedAt: now },
    });
}

/** 进程内单飞：同一 key 的并发拉取共享同一个 Promise，避免双开页面时重复轰炸外部源 */
const inflight = new Map<string, Promise<unknown>>();

function withInflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * 快照里对单个数据源的拉取/回退决策。
 * 缓存新鲜：直接返回；缓存过期：**先返回缓存（stale），后台异步刷新**，
 * 避免 open-meteo（实测 4s+）这类慢源把整屏 LCP 拖到 6 秒以上。
 */
async function resolveSource<T>(
  ctx: ModuleContext,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<SourceEnvelope<T>> {
  const cached = await readCache(ctx, key);
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime();
    if (age < ttlMs) {
      return {
        status: 'fresh',
        fetchedAt: cached.fetchedAt.toISOString(),
        payload: cached.payload as T,
      };
    }
    // stale-while-revalidate：先让页面上数据，再悄悄换新
    void withInflight(`${ctx.workspaceId}:${key}`, fetcher)
      .then((payload) => writeCache(ctx, key, payload))
      .catch(() => undefined);
    return {
      status: 'stale',
      fetchedAt: cached.fetchedAt.toISOString(),
      payload: cached.payload as T,
    };
  }
  try {
    const payload = await withInflight(`${ctx.workspaceId}:${key}`, fetcher);
    await writeCache(ctx, key, payload);
    return { status: 'fresh', fetchedAt: new Date().toISOString(), payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', fetchedAt: null, payload: null, error: message };
  }
}

/* ---------------- 倒计时 ---------------- */

interface CountdownRow {
  id: string;
  title: string;
  targetDate: string;
  pinned: boolean;
  deletedAt: string | null;
}

async function listCountdownRows(
  ctx: ModuleContext,
  includeDeleted: boolean,
): Promise<CountdownRow[]> {
  const rows = await ctx.db
    .select()
    .from(countdown)
    .where(
      includeDeleted
        ? eq(countdown.workspaceId, ctx.workspaceId)
        : and(eq(countdown.workspaceId, ctx.workspaceId), isNull(countdown.deletedAt)),
    )
    .orderBy(desc(countdown.pinned), asc(countdown.targetDate))
    .limit(50);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    targetDate: row.targetDate,
    pinned: row.pinned,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }));
}

/* ---------------- 活跃度（打卡热力图 / 连续天数） ---------------- */

/** 工作空间本地日期（date 列无时区，按服务器本地时区取日） */
function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 听歌统计窗口：day=今天 / week=近7天 / month=近30天 / year=近12个月（按月桶）；offset=向前平移几个周期 */
function rangeWindow(
  range: ListeningRange,
  offset = 0,
): {
  startDay: string;
  endDay: string;
  bucket: 'day' | 'month';
} {
  const today = new Date();
  const windowOf = (days: number, end: Date) => {
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    return { startDay: localDay(start), endDay: localDay(end) };
  };

  if (range === 'day') {
    const end = new Date(today);
    end.setDate(today.getDate() - offset);
    return { startDay: localDay(end), endDay: localDay(end), bucket: 'day' };
  }
  if (range === 'week') {
    const end = new Date(today);
    end.setDate(today.getDate() - 7 * offset);
    return { ...windowOf(7, end), bucket: 'day' };
  }
  if (range === 'lastWeek') {
    // 上一个自然周（周一~周日）：offset=1 即再往前推一周
    const dayNum = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - dayNum);
    const end = new Date(thisMonday);
    end.setDate(thisMonday.getDate() - 1 - 7 * offset);
    return { ...windowOf(7, end), bucket: 'day' };
  }
  if (range === 'month') {
    const end = new Date(today);
    end.setDate(today.getDate() - 30 * offset);
    return { ...windowOf(30, end), bucket: 'day' };
  }
  // year：近 12 个月按 offset 年整体平移，终点不超过今天
  const monthEnd = new Date(today.getFullYear(), today.getMonth() - 12 * offset + 1, 0);
  const end = monthEnd > today ? today : monthEnd;
  return {
    startDay: localDay(new Date(end.getFullYear(), end.getMonth() - 11, 1)),
    endDay: localDay(end),
    bucket: 'month',
  };
}

/** 把稀疏聚合补成连续桶（前端直接画柱状图） */
function fillBuckets(
  map: Map<string, number>,
  bucket: 'day' | 'month',
  window: { startDay: string; endDay: string },
): Array<{ label: string; seconds: number }> {
  const out: Array<{ label: string; seconds: number }> = [];
  const parseDay = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year!, (month ?? 1) - 1, day ?? 1);
  };
  const start = parseDay(window.startDay);
  const end = parseDay(window.endDay);

  if (bucket === 'month') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      out.push({ label, seconds: map.get(label) ?? 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }

  const cursor = new Date(start);
  while (cursor <= end) {
    const label = localDay(cursor);
    out.push({ label, seconds: map.get(label) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

interface ActivityDay {
  day: string;
  count: number;
}

async function readRecentActivity(ctx: ModuleContext, days: number): Promise<ActivityDay[]> {
  const since = localDay(new Date(Date.now() - days * 86_400_000));
  const rows = await ctx.db
    .select({ day: activity.day, count: activity.count })
    .from(activity)
    .where(and(eq(activity.workspaceId, ctx.workspaceId), gte(activity.day, since)))
    .orderBy(asc(activity.day));
  return rows.filter((row) => row.count > 0).map((row) => ({ day: row.day, count: row.count }));
}

/**
 * 连续打卡天数（宽容型规则，参考习惯追踪 UX 惯例）：
 * 从今天往回数连续有产出的日子；今天尚未打卡不断签（今天还没结束），从昨天起算。
 */
function currentStreak(days: ActivityDay[]): number {
  const done = new Set(days.map((d) => d.day));
  let streak = 0;
  const cursor = new Date();
  if (!done.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (done.has(localDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** AI 每日摘要载荷（缓存进 sourceCache，key 按天，TTL 内不重生成） */
interface DailySummary {
  text: string;
  generatedAt: string;
}

/**
 * 生成每日小结：汇总活跃度 / 临近纪念日 / 当地天气，经内核 AI 层生成（阶段 5 适配器）。
 * 快照的按日缓存拉取与 refresh 强刷共用此实现；MockAI 下返回模板文案，配置真实供应商后自动升级。
 */
async function generateDailySummary(ctx: ModuleContext): Promise<DailySummary> {
  const recent = await readRecentActivity(ctx, 365);
  const streak = currentStreak(recent);
  const todayDay = localDay();
  const todayCount = recent.find((d) => d.day === todayDay)?.count ?? 0;

  const settings = parseSettings(await ctx.settings.get());
  const weatherRow = settings.city ? await readCache(ctx, weatherCacheKey(settings.city)) : null;
  const weatherPayload = weatherRow?.payload as WeatherData | undefined;
  const weatherText =
    weatherPayload?.now !== undefined
      ? `${weatherPayload.now.text} ${Math.round(weatherPayload.now.temperature)}°C`
      : null;

  const countdownRows = await listCountdownRows(ctx, false);
  const hour = new Date().getHours();
  const weekAgo = localDay(new Date(Date.now() - 7 * 86_400_000));
  const weekCount = recent.filter((d) => d.day >= weekAgo).reduce((sum, d) => sum + d.count, 0);
  const parts: string[] = [
    `现在是今天 ${hour} 点。`,
    `最近 7 天完成待办 ${weekCount} 件，连续打卡 ${streak} 天${todayCount > 0 ? `，今天已完成 ${todayCount} 件` : ''}。`,
  ];
  const upcoming = countdownRows.slice(0, 3);
  if (upcoming.length > 0) {
    const described = upcoming.map((c) => {
      const diff = Math.ceil(
        (new Date(`${c.targetDate}T00:00:00`).getTime() -
          new Date(`${todayDay}T00:00:00`).getTime()) /
          86_400_000,
      );
      return `${c.title}（${diff >= 0 ? `还有 ${diff} 天` : `已过 ${-diff} 天`}）`;
    });
    parts.push(`临近的纪念日：${described.join('、')}。`);
  }
  if (weatherText) parts.push(`当地天气：${weatherText}。`);
  parts.push(
    '请基于这些信息写一段 60 字以内的中文小结：一句对当下状态的肯定 + 一条具体可行的小建议。不要罗列数据，不要用 markdown。',
  );
  const text = await ctx.ai.complete(
    parts.join(' '),
    '你是 Atlas 个人成长助手：温暖、直接、有智慧，像一位老朋友。只输出纯文本小结本身。',
  );
  return { text, generatedAt: new Date().toISOString() };
}

/* ---------------- 模块定义 ---------------- */

export const definition: ModuleDefinition = {
  manifest,
  actions: {
    /** 大屏全量快照：设置 + 各数据源信封 + 倒计时。页面首屏与轮询共用 */
    snapshot: {
      permission: 'dashboard:read',
      handler: async (ctx) => {
        const settings = parseSettings(await ctx.settings.get());
        const sourcesEnabled = settings.sources ?? {};
        const weatherCity = settings.city ?? null;

        const enabledHotSources = HOT_SOURCES.filter(
          (source) => sourcesEnabled[source.key] !== false,
        );
        const emptyEnvelope = { status: 'empty', fetchedAt: null, payload: null } as const;
        const todayDay = localDay();

        // 所有外部源与本地查询并行：串行时天气 4s+ 会把首屏 LCP 拖到 6s 以上
        const [results, weather, quote, wallpaper, countdownRows, recentActivity, summary] =
          await Promise.all([
            Promise.all(
              enabledHotSources.map((source) =>
                resolveSource<HotItem[]>(ctx, `hot:${source.key}`, source.ttlMs, source.fetchList),
              ),
            ),
            weatherCity
              ? resolveSource<WeatherData>(
                  ctx,
                  weatherCacheKey(weatherCity),
                  30 * 60_000,
                  async () => {
                    if (isFakeMode()) return fakeWeather;
                    return fetchWeather(weatherCity.lat, weatherCity.lon);
                  },
                )
              : Promise.resolve(emptyEnvelope as SourceEnvelope<WeatherData>),
            resolveSource<Quote>(ctx, 'quote', 6 * 3_600_000, async () => {
              if (isFakeMode()) return fakeQuote;
              return fetchQuote();
            }),
            settings.wallpaper === false
              ? Promise.resolve(emptyEnvelope as SourceEnvelope<Wallpaper>)
              : resolveSource<Wallpaper>(ctx, 'wallpaper', 12 * 3_600_000, async () => {
                  if (isFakeMode()) return { ...fakeWallpaper, url: '' };
                  return fetchWallpaper();
                }),
            listCountdownRows(ctx, false),
            readRecentActivity(ctx, 365),
            // AI 每日摘要：按天缓存（key 含日期，TTL 6 小时），失败回退旧值，不打断大屏
            resolveSource<DailySummary>(ctx, `summary:${todayDay}`, 6 * 3_600_000, () =>
              generateDailySummary(ctx),
            ),
          ]);

        const hot: Record<string, SourceEnvelope<HotItem[]>> = {};
        enabledHotSources.forEach((source, index) => {
          hot[source.key] = results[index] as SourceEnvelope<HotItem[]>;
        });

        const streak = currentStreak(recentActivity);
        const todayCount = recentActivity.find((d) => d.day === todayDay)?.count ?? 0;

        return {
          serverTime: new Date().toISOString(),
          city: weatherCity,
          options: {
            sources: HOT_SOURCES.reduce<Record<string, boolean>>((acc, source) => {
              acc[source.key] = sourcesEnabled[source.key] !== false;
              return acc;
            }, {}),
            wallpaper: settings.wallpaper !== false,
          },
          weather,
          hot,
          quote,
          wallpaper,
          countdowns: countdownRows,
          activity: {
            days: recentActivity,
            streak,
            todayCount,
          },
          summary,
        };
      },
    },

    /** 歌词：按歌曲 ID 取 LRC 并解析，前端按播放进度同步；不落库，客户端按歌曲缓存 */
    lyrics: {
      permission: 'dashboard:read',
      handler: async (_ctx, input) => {
        const parsed = lyricsSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        if (isFakeMode()) return fakeLyrics;
        return fetchNeteaseLyrics(parsed.data.id);
      },
    },

    /* ---------------- 网易云账号（ADR-0006：非官方接口，适配器可替换） ---------------- */

    /** 发起扫码登录：返回 unikey 与扫码地址；二维码由浏览器本地渲染（unikey 不出本系统） */
    neteaseQrStart: {
      permission: 'dashboard:write',
      handler: async () => {
        if (isFakeMode()) {
          return { unikey: 'fake-unikey-0001', qrUrl: 'https://music.163.com/login?codekey=fake' };
        }
        return qrUnikey();
      },
    },

    /** 轮询扫码状态：confirmed 时加密落库绑定并发事件；cookie 明文只在内存流转 */
    neteaseQrPoll: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = neteaseQrPollSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        // 假数据模式不模拟绑定成功（避免与固定未绑定的 liked/净库语义打架）；绑定路径由 e2e 路由拦截覆盖
        if (isFakeMode()) return { status: 'waiting' };
        const poll = await qrCheck(parsed.data.unikey);
        if (poll.status !== 'confirmed' || !poll.cookie) return { status: poll.status };
        const profile = await fetchProfile(poll.cookie);
        await ctx.db
          .insert(neteaseBinding)
          .values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            neteaseUid: profile.uid,
            neteaseNickname: profile.nickname,
            cookieSealed: sealSecret(poll.cookie),
          })
          .onConflictDoUpdate({
            // 唯一索引是部分的（deleted_at is null），冲突推断需带同谓词
            target: [neteaseBinding.workspaceId, neteaseBinding.userId],
            targetWhere: sql`deleted_at is null`,
            set: {
              neteaseUid: profile.uid,
              neteaseNickname: profile.nickname,
              cookieSealed: sealSecret(poll.cookie),
              deletedAt: null,
              updatedAt: new Date(),
            },
          });
        await ctx.events.publish('dashboard.netease.bound', {
          uid: profile.uid,
          nickname: profile.nickname,
        });
        return { status: 'confirmed', uid: profile.uid, nickname: profile.nickname };
      },
    },

    /** 绑定状态查询（不含任何凭据信息），供播放器决定曲目来源与是否显示登录入口 */
    neteaseBinding: {
      permission: 'dashboard:read',
      handler: async (ctx) => {
        if (isFakeMode()) return { bound: false };
        const row = await ctx.db
          .select({ uid: neteaseBinding.neteaseUid, nickname: neteaseBinding.neteaseNickname })
          .from(neteaseBinding)
          .where(
            and(
              eq(neteaseBinding.workspaceId, ctx.workspaceId),
              eq(neteaseBinding.userId, ctx.userId),
              isNull(neteaseBinding.deletedAt),
            ),
          )
          .limit(1);
        const binding = row[0];
        return binding
          ? { bound: true, uid: binding.uid, nickname: binding.nickname }
          : { bound: false };
      },
    },

    /** 喜欢列表：最近喜欢在前；未绑定返回 bound:false 由前端回退内置歌单。
     * 假数据模式固定未绑定：播放器回退内置精选，绑定路径由 e2e 路由拦截覆盖。 */
    neteaseLiked: {
      permission: 'dashboard:read',
      handler: async (ctx) => {
        if (isFakeMode()) return { bound: false, tracks: [] satisfies NeteaseTrack[] };
        const binding = await activeBinding(ctx);
        if (!binding) return { bound: false, tracks: [] satisfies NeteaseTrack[] };
        const tracks = await fetchLikedTracks(binding.cookie, binding.neteaseUid);
        return { bound: true, nickname: binding.neteaseNickname, tracks };
      },
    },

    /** 单首可播 CDN 地址（链接有时效，前端现取现用、短缓存）；url 为 null 表示版权/VIP 限制 */
    neteaseSongUrl: {
      permission: 'dashboard:read',
      handler: async (ctx, input) => {
        const parsed = neteaseSongUrlSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        if (isFakeMode()) return { url: 'https://example.com/fake-audio.mp3', type: 'mp3' };
        const binding = await activeBinding(ctx);
        if (!binding) return { url: null, type: null };
        return fetchSongUrl(binding.cookie, parsed.data.id);
      },
    },

    /** 解绑：软删除并轮换密文（旧密文不可查询即失效）；发事件留痕 */
    neteaseUnbind: {
      permission: 'dashboard:write',
      handler: async (ctx) => {
        const rows = await ctx.db
          .update(neteaseBinding)
          .set({ deletedAt: new Date(), cookieSealed: 'unbound', updatedAt: new Date() })
          .where(
            and(
              eq(neteaseBinding.workspaceId, ctx.workspaceId),
              eq(neteaseBinding.userId, ctx.userId),
              isNull(neteaseBinding.deletedAt),
            ),
          )
          .returning({ uid: neteaseBinding.neteaseUid });
        if (rows[0]) await ctx.events.publish('dashboard.netease.unbound', { uid: rows[0].uid });
        return { unbound: rows.length > 0 };
      },
    },

    /* ---------------- 听歌时长（天 × 用户 × 歌曲聚合；心跳为遥测写入，不进审计） ---------------- */

    /**
     * 心跳上报：播放器每 30s 冲一次实际播放秒数；切歌/暂停/关页前也冲。
     * upsert 累加到 (workspace, user, day, song)；first 标记一次"播放发生"（+1 次数）。
     */
    listeningHeartbeat: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = listeningHeartbeatSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const { songId, title, artist, cover, seconds, first } = parsed.data;
        await ctx.db
          .insert(listeningDaily)
          .values({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            userName: ctx.displayName || '用户',
            day: localDay(),
            songId,
            songTitle: title,
            songArtist: artist,
            songCover: cover ?? '',
            seconds,
            plays: first ? 1 : 0,
          })
          .onConflictDoUpdate({
            target: [
              listeningDaily.workspaceId,
              listeningDaily.userId,
              listeningDaily.day,
              listeningDaily.songId,
            ],
            set: {
              seconds: sql`${listeningDaily.seconds} + excluded.seconds`,
              plays: sql`${listeningDaily.plays} + excluded.plays`,
              songTitle: title,
              songArtist: artist,
              // 本次心跳没带封面时保留库里已有的（切歌瞬间拿不到 picUrl 不能把封面抹掉）
              songCover: cover ? cover : sql`${listeningDaily.songCover}`,
              updatedAt: new Date(),
            },
          });
        return { ok: true };
      },
    },

    /** 我的听歌汇总：day=今天 / week=近7天 / month=近30天 / year=近12个月 */
    listeningSummary: {
      permission: 'dashboard:read',
      handler: async (ctx, input) => {
        const parsed = listeningRangeSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const { startDay, endDay, bucket } = rangeWindow(
          parsed.data.range,
          parsed.data.offset ?? 0,
        );
        const rows = await ctx.db
          .select({
            day: listeningDaily.day,
            songId: listeningDaily.songId,
            songTitle: listeningDaily.songTitle,
            songArtist: listeningDaily.songArtist,
            songCover: sql<string>`max(${listeningDaily.songCover})`,
            seconds: sql<number>`sum(${listeningDaily.seconds})::int`,
            plays: sql<number>`sum(${listeningDaily.plays})::int`,
          })
          .from(listeningDaily)
          .where(
            and(
              eq(listeningDaily.workspaceId, ctx.workspaceId),
              eq(listeningDaily.userId, ctx.userId),
              gte(listeningDaily.day, startDay),
              lte(listeningDaily.day, endDay),
            ),
          )
          .groupBy(
            listeningDaily.day,
            listeningDaily.songId,
            listeningDaily.songTitle,
            listeningDaily.songArtist,
          );

        let totalSeconds = 0;
        let totalPlays = 0;
        const bucketSeconds = new Map<string, number>();
        const artistSeconds = new Map<string, { artist: string; seconds: number; plays: number }>();
        const songSeconds = new Map<
          number,
          {
            songId: number;
            title: string;
            artist: string;
            cover: string;
            seconds: number;
            plays: number;
          }
        >();
        for (const row of rows) {
          const seconds = Number(row.seconds ?? 0);
          totalSeconds += seconds;
          totalPlays += Number(row.plays ?? 0);
          const label = bucket === 'month' ? String(row.day).slice(0, 7) : String(row.day);
          bucketSeconds.set(label, (bucketSeconds.get(label) ?? 0) + seconds);
          const artist = row.songArtist || '未知歌手';
          const artistRow = artistSeconds.get(artist);
          if (artistRow) {
            artistRow.seconds += seconds;
            artistRow.plays += Number(row.plays ?? 0);
          } else {
            artistSeconds.set(artist, {
              artist,
              seconds,
              plays: Number(row.plays ?? 0),
            });
          }
          const song = songSeconds.get(row.songId);
          if (song) song.seconds += seconds;
          else
            songSeconds.set(row.songId, {
              songId: row.songId,
              title: row.songTitle,
              artist: row.songArtist,
              cover: row.songCover ?? '',
              seconds,
              plays: Number(row.plays ?? 0),
            });
        }
        const buckets = fillBuckets(bucketSeconds, bucket, { startDay, endDay });
        const topSongs = [...songSeconds.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 10);
        // 歌手榜：报告里按艺人聚合看口味分布；封面取该歌手播放最多那首的歌封
        const allSongs = [...songSeconds.values()];
        const topArtists = [...artistSeconds.values()]
          .sort((a, b) => b.seconds - a.seconds)
          .slice(0, 8)
          .map((entry) => {
            const own = allSongs
              .filter((song) => song.artist === entry.artist)
              .sort((a, b) => b.seconds - a.seconds);
            return {
              artist: entry.artist,
              seconds: entry.seconds,
              plays: entry.plays,
              songCount: own.length,
              cover: own[0]?.cover ?? '',
            };
          });
        return {
          range: parsed.data.range,
          offset: parsed.data.offset ?? 0,
          totalSeconds,
          totalPlays,
          buckets,
          topSongs,
          topArtists,
        };
      },
    },

    /**
     * 全站听歌排名（ADR-0008：一人一号一大屏，排名面向系统全部注册用户）。
     * 经 SECURITY DEFINER 函数跨工作空间聚合（仅暴露聚合结果，不泄露行级数据）。
     */
    listeningRanking: {
      permission: 'dashboard:read',
      handler: async (ctx, input) => {
        const parsed = listeningRangeSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const { startDay, endDay } = rangeWindow(parsed.data.range);
        const result = await ctx.db.execute(
          sql`select * from platform.listening_ranking_global(${startDay}::date, ${endDay}::date, 50)`,
        );
        const list = (
          result.rows as Array<{ user_id: string; user_name: string; seconds: string | number }>
        ).map((row, index) => ({
          userId: row.user_id,
          userName: row.user_name,
          seconds: Number(row.seconds ?? 0),
          rank: index + 1,
        }));
        const mine = list.find((item) => item.userId === ctx.userId) ?? null;
        return { range: parsed.data.range, list, me: mine };
      },
    },

    /** 手动强刷：跳过 TTL 重新拉取指定源（缺省为全部），失败抛 400 并说明 */
    refresh: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = refreshSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const wanted =
          parsed.data.sources ??
          HOT_SOURCES.map((s) => `hot:${s.key}`).concat([
            'weather',
            'quote',
            'wallpaper',
            'summary',
          ]);

        const failures: string[] = [];
        for (const key of wanted) {
          try {
            if (key.startsWith('hot:')) {
              const source = getHotSource(key.slice(4));
              if (!source) throw new Error('未知热榜源');
              await writeCache(ctx, key, await source.fetchList());
            } else if (key === 'weather') {
              const settings = parseSettings(await ctx.settings.get());
              if (!settings.city) throw new Error('未设置城市');
              await writeCache(
                ctx,
                weatherCacheKey(settings.city),
                isFakeMode()
                  ? fakeWeather
                  : await fetchWeather(settings.city.lat, settings.city.lon),
              );
            } else if (key === 'quote') {
              await writeCache(ctx, 'quote', isFakeMode() ? fakeQuote : await fetchQuote());
            } else if (key === 'wallpaper') {
              await writeCache(
                ctx,
                'wallpaper',
                isFakeMode() ? { ...fakeWallpaper, url: '' } : await fetchWallpaper(),
              );
            } else if (key === 'summary') {
              await writeCache(ctx, `summary:${localDay()}`, await generateDailySummary(ctx));
            } else {
              throw new Error('未知数据源');
            }
          } catch (error) {
            failures.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (failures.length > 0)
          throw new ModuleActionError(`部分数据源刷新失败：${failures.join('；')}`);
        return { refreshed: wanted };
      },
    },

    /** 城市搜索（服务端代理 Open-Meteo 地理编码 + 缓存 10 分钟） */
    searchCity: {
      permission: 'dashboard:read',
      handler: async (ctx, input) => {
        const parsed = searchCitySchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const q = parsed.data.q.trim();
        if (isFakeMode())
          return {
            cities: [fakeLocation].map((f) => ({
              name: f.city,
              admin: f.region,
              lat: f.lat,
              lon: f.lon,
            })),
          };
        const key = `geocode:${q}`;
        const cached = await readCache(ctx, key);
        if (cached && Date.now() - cached.fetchedAt.getTime() < EMPTY_TTL_MS) {
          return { cities: cached.payload as CitySuggestion[] };
        }
        const payload = await geocodeCity(q).catch((error: unknown) => {
          throw new ModuleActionError(
            `城市搜索失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
        await writeCache(ctx, key, payload);
        return { cities: payload };
      },
    },

    /** IP 归属地检测：本机部署即使用者出口网络；返回建议，是否采用由用户决定 */
    detectLocation: {
      permission: 'dashboard:read',
      handler: async () => {
        if (isFakeMode()) return { location: fakeLocation satisfies DetectedLocation };
        const location = await detectLocationByIp().catch((error: unknown) => {
          throw new ModuleActionError(
            `定位失败：${error instanceof Error ? error.message : String(error)}`,
          );
        });
        return { location };
      },
    },

    /** 倒计时列表：snapshot 内含活跃项；此处供设置抽屉查看/恢复已删除项 */
    listCountdowns: {
      permission: 'dashboard:read',
      handler: async (ctx, input) => {
        const includeDeleted = Boolean(
          (input as { includeDeleted?: boolean } | undefined)?.includeDeleted,
        );
        return { countdowns: await listCountdownRows(ctx, includeDeleted) };
      },
    },

    setCity: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = citySchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        await ctx.settings.set({ city: parsed.data });
        return { city: parsed.data };
      },
    },

    /** 数据源开关与壁纸开关（布尔可关、未提及的键不动） */
    setOptions: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const raw = (input ?? {}) as { sources?: Record<string, boolean>; wallpaper?: boolean };
        const patch: Record<string, unknown> = {};
        if (raw.sources !== undefined) {
          const known = new Set(HOT_SOURCES.map((s) => s.key));
          for (const [key, value] of Object.entries(raw.sources)) {
            if (!known.has(key) || typeof value !== 'boolean') bad(`未知数据源 ${key}`);
          }
          patch.sources = raw.sources;
        }
        if (raw.wallpaper !== undefined) {
          if (typeof raw.wallpaper !== 'boolean') bad('wallpaper 需为布尔');
          patch.wallpaper = raw.wallpaper;
        }
        await ctx.settings.set(patch);
        return parseSettings(await ctx.settings.get());
      },
    },

    createCountdown: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = createCountdownSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const rows = await ctx.db
          .insert(countdown)
          .values({
            workspaceId: ctx.workspaceId,
            title: parsed.data.title,
            targetDate: parsed.data.targetDate,
            pinned: parsed.data.pinned ?? false,
            createdBy: ctx.userId,
          })
          .returning();
        const created = rows[0]!;
        await ctx.events.publish('dashboard.countdown.created', {
          countdownId: created.id,
          title: created.title,
        });
        return { id: created.id };
      },
    },

    updateCountdown: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const parsed = updateCountdownSchema.safeParse(input ?? {});
        if (!parsed.success) bad(parsed.error.issues.map((i) => i.message).join('; '));
        const rows = await ctx.db
          .update(countdown)
          .set({
            ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
            ...(parsed.data.targetDate !== undefined ? { targetDate: parsed.data.targetDate } : {}),
            ...(parsed.data.pinned !== undefined ? { pinned: parsed.data.pinned } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(countdown.id, parsed.data.id), eq(countdown.workspaceId, ctx.workspaceId)))
          .returning({ id: countdown.id });
        if (rows.length === 0) throw new ModuleActionError('倒计时不存在');
        await ctx.events.publish('dashboard.countdown.updated', { countdownId: parsed.data.id });
        return { id: parsed.data.id };
      },
    },

    /** 软删除：进"已删除"列表，可在设置抽屉恢复 */
    deleteCountdown: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const id = z
          .string()
          .uuid()
          .safeParse((input as { id?: unknown } | undefined)?.id);
        if (!id.success) bad('id 需为 UUID');
        const rows = await ctx.db
          .update(countdown)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(countdown.id, id.data),
              eq(countdown.workspaceId, ctx.workspaceId),
              isNull(countdown.deletedAt),
            ),
          )
          .returning({ id: countdown.id });
        if (rows.length === 0) throw new ModuleActionError('倒计时不存在');
        await ctx.events.publish('dashboard.countdown.deleted', { countdownId: id.data });
        return { id: id.data };
      },
    },

    restoreCountdown: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const id = z
          .string()
          .uuid()
          .safeParse((input as { id?: unknown } | undefined)?.id);
        if (!id.success) bad('id 需为 UUID');
        const rows = await ctx.db
          .update(countdown)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(countdown.id, id.data),
              eq(countdown.workspaceId, ctx.workspaceId),
              isNotNull(countdown.deletedAt),
            ),
          )
          .returning({ id: countdown.id });
        if (rows.length === 0) throw new ModuleActionError('倒计时不存在或未删除');
        await ctx.events.publish('dashboard.countdown.restored', { countdownId: id.data });
        return { id: id.data };
      },
    },

    /**
     * 事件订阅处理器：todo.completed → 当日活跃度 +1（热力图/连续打卡的数据源）。
     * 由派发器在租户事务内调用（at-least-once），upsert 累加天然幂等到"当日计数"粒度；
     * 同一待办重复投递会重复计数，可接受（打卡语义重在"当日有无"）。
     */
    onTodoCompleted: {
      permission: 'dashboard:write',
      handler: async (ctx, input) => {
        const payload = (input ?? {}) as { todoId?: unknown };
        if (typeof payload.todoId !== 'string' || payload.todoId.length === 0) {
          return { counted: false };
        }
        const day = localDay();
        await ctx.db
          .insert(activity)
          .values({ workspaceId: ctx.workspaceId, day, count: 1 })
          .onConflictDoUpdate({
            target: [activity.workspaceId, activity.day],
            set: { count: sql`${activity.count} + 1`, updatedAt: new Date() },
          });
        return { counted: true, day };
      },
    },
  },
};

/** 适配器归一化导出：供单元测试与后续复用（不属于模块协议表面） */
export {
  normalizeBaidu,
  normalizeBilibili,
  normalizeDouyin,
  normalizeToutiao,
  normalizeWeibo,
} from './providers/hotlists';
export { describeWeatherCode } from './providers/weather';
export { parseLrc } from './providers/lyrics';
export { seal as sealSecret, open as openSecret } from './providers/secret-box';
export {
  qrUnikey,
  qrCheck,
  fetchProfile,
  fetchLikedTracks,
  fetchSongDetails,
  fetchSongUrl,
} from './providers/netease';
