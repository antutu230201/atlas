import type { Request } from 'express';

/** 从 Cookie 头解析指定 cookie（避免引入 cookie-parser 依赖） */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function readIp(req: Request): string | null {
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null;
}

export function sessionCookieOptions(maxAgeSeconds: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}
