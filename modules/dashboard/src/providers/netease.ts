/**
 * 网易云音乐非官方接口适配器（宪法 §5：外部服务一律经适配器接口）。
 *
 * 协议现状（2026-11 实测验证）：登录二维码、喜欢列表、歌曲地址等接口均可
 * 「桌面客户端 UA + 明文表单」直连 /api/... 路径，无需 weapi/eapi 加密。
 * 非官方接口随时可能随网易风控调整：所有失败统一抛 NeteaseError，由调用方兜底降级，
 * 不在本层做重试（避免触发风控）。
 */

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117';

export class NeteaseError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'NeteaseError';
  }
}

/** 二维码轮询状态：801 等待扫码 / 802 已扫码待确认 / 803 已确认（cookie 在 Set-Cookie） / 800 已过期 */
export type QrPollStatus = 'waiting' | 'scanned' | 'confirmed' | 'expired';

const QR_STATUS_MAP: Record<number, QrPollStatus> = {
  800: 'expired',
  801: 'waiting',
  802: 'scanned',
  803: 'confirmed',
};

export interface QrUnikey {
  unikey: string;
  /** 用户用网易云 App 扫码的目标地址 */
  qrUrl: string;
}

export interface QrPollResult {
  status: QrPollStatus;
  /** 仅 confirmed 时返回：整串会话 cookie（含 MUSIC_U），调用方须加密落库、不得落日志 */
  cookie?: string;
}

export interface NeteaseProfile {
  uid: number;
  nickname: string;
}

export interface NeteaseTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  durationMs: number;
}

export interface NeteaseSongUrl {
  url: string | null;
  /** 音频容器类型，如 mp3 / flac；null 表示拿不到可播地址（VIP/版权限制） */
  type: string | null;
}

interface NeteaseResponse {
  code?: number;
  message?: string;
  [key: string]: unknown;
}

const TIMEOUT_MS = 6000;

async function post(
  path: string,
  body: Record<string, string | number>,
  cookie?: string,
): Promise<Response> {
  return fetch(`https://music.163.com${path}`, {
    method: 'POST',
    headers: {
      'user-agent': DESKTOP_UA,
      'content-type': 'application/x-www-form-urlencoded',
      referer: 'https://music.163.com/',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)] as [string, string]),
    ),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
}

async function postJson(
  path: string,
  body: Record<string, string | number>,
  cookie?: string,
): Promise<NeteaseResponse> {
  const response = await post(path, body, cookie);
  const raw = await response.text();
  if (!response.ok) throw new NeteaseError(`HTTP ${response.status}`);
  if (!raw) throw new NeteaseError('网易云返回空响应（接口或风控可能已变化）');
  const parsed = JSON.parse(raw) as NeteaseResponse;
  if (parsed.code !== 200) {
    throw new NeteaseError(parsed.message ?? `网易云错误码 ${parsed.code}`, parsed.code);
  }
  return parsed;
}

/** 301 = 登录凭据失效（匿名/过期），统一转成可读错误；其余错误原样上抛 */
function asCredentialError(error: unknown): never {
  if (error instanceof NeteaseError && error.code === 301) {
    throw new NeteaseError('登录凭据无效或已过期，请重新扫码', 301);
  }
  throw error as Error;
}

/** 申请登录二维码 key；扫码地址由 unikey 拼出，二维码在浏览器本地渲染（unikey 不出本系统） */
export async function qrUnikey(): Promise<QrUnikey> {
  const parsed = await postJson('/api/login/qrcode/unikey', { type: 3 });
  const unikey = typeof parsed.unikey === 'string' ? parsed.unikey : '';
  if (!unikey) throw new NeteaseError('未取得二维码 key');
  return { unikey, qrUrl: `https://music.163.com/login?codekey=${unikey}` };
}

/** 轮询扫码状态；confirmed 时从 Set-Cookie 提取整串会话 cookie */
export async function qrCheck(unikey: string): Promise<QrPollResult> {
  const response = await post('/api/login/qrcode/client/login', { key: unikey, type: 3 });
  const raw = await response.text();
  if (!response.ok) throw new NeteaseError(`HTTP ${response.status}`);
  if (!raw) throw new NeteaseError('网易云返回空响应（接口或风控可能已变化）');
  const parsed = JSON.parse(raw) as NeteaseResponse;
  const status = QR_STATUS_MAP[parsed.code ?? 0];
  if (!status)
    throw new NeteaseError(parsed.message ?? `未知二维码状态 ${parsed.code}`, parsed.code);
  if (status !== 'confirmed') return { status };
  const cookies = response.headers
    .getSetCookie()
    .map((item) => item.split(';')[0] ?? '')
    .filter((item) => item.includes('='));
  const cookie = cookies.join('; ');
  if (!cookie.includes('MUSIC_U=')) throw new NeteaseError('扫码成功但未取得登录凭据');
  return { status, cookie };
}

/** 校验 cookie 并取账号信息（昵称/uid）；cookie 失效（301）时抛可读错误 */
export async function fetchProfile(cookie: string): Promise<NeteaseProfile> {
  const parsed = await postJson('/api/nuser/account/get', {}, cookie).catch(asCredentialError);
  const profile = parsed.profile as { userId?: number; nickname?: string } | undefined;
  if (!profile?.userId) throw new NeteaseError('登录凭据无效或已过期，请重新扫码', parsed.code);
  return { uid: profile.userId, nickname: profile.nickname ?? `用户${profile.userId}` };
}

/** 当前账号的喜欢列表（无序 id 集合）；最多返回 limit 条 */
export async function fetchLikedIds(cookie: string, uid: number, limit = 1000): Promise<number[]> {
  const parsed = await postJson('/api/song/like/get', { uid }, cookie).catch(asCredentialError);
  const ids = Array.isArray(parsed.ids)
    ? (parsed.ids as unknown[]).filter((id): id is number => typeof id === 'number')
    : [];
  return ids.slice(0, limit);
}

interface SongDetail {
  id?: number;
  name?: string;
  dt?: number;
  ar?: { name?: string }[];
  al?: { name?: string; picUrl?: string };
}

/** 批量取歌曲元数据（标题/歌手/专辑/封面/真实时长）；拿不到的 id 跳过，缺字段跳过 */
export async function fetchSongDetails(ids: number[]): Promise<Map<number, NeteaseTrack>> {
  const tracks = new Map<number, NeteaseTrack>();
  const batchSize = 500;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const parsed = await postJson('/api/v3/song/detail', {
      c: JSON.stringify(batch.map((id) => ({ id }))),
      ids: JSON.stringify(batch),
    });
    const songs = Array.isArray(parsed.songs) ? (parsed.songs as SongDetail[]) : [];
    for (const song of songs) {
      // 只要求 id + 标题；歌手缺失不丢歌（网易云偶发空 ar），展示层兜底「未知歌手」
      if (!song.id || !song.name) continue;
      const artist = song.ar
        ?.map((item) => item.name)
        .filter(Boolean)
        .join(' / ');
      tracks.set(song.id, {
        id: song.id,
        title: song.name,
        artist: artist || '未知歌手',
        album: song.al?.name ?? '',
        cover: song.al?.picUrl ?? '',
        durationMs: typeof song.dt === 'number' ? song.dt : 0,
      });
    }
  }
  return tracks;
}

/** 拉取当前账号「喜欢列表」并按接口返回顺序（最近喜欢在前）映射为曲目 */
export async function fetchLikedTracks(
  cookie: string,
  uid: number,
  limit = 1000,
): Promise<NeteaseTrack[]> {
  const ids = await fetchLikedIds(cookie, uid, limit);
  const details = await fetchSongDetails(ids);
  return ids.flatMap((id) => {
    const track = details.get(id);
    return track ? [track] : [];
  });
}

/** 取单首可播 CDN 地址（链接有时效，用前现取、不做长期缓存）；null = 无可播地址 */
export async function fetchSongUrl(cookie: string, id: number): Promise<NeteaseSongUrl> {
  const parsed = await postJson(
    '/api/song/enhance/player/url/v1',
    { ids: JSON.stringify([id]), level: 'exhigh', encodeType: 'mp3' },
    cookie,
  );
  const data = Array.isArray(parsed.data)
    ? (parsed.data as { url?: string | null; type?: string | null }[])
    : [];
  const first = data[0];
  return {
    url: typeof first?.url === 'string' && first.url ? first.url : null,
    type: first?.type ?? null,
  };
}
