import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  AUTH_SERVICE_TOKEN,
  ENV_TOKEN,
  RATE_LIMIT_SERVICE_TOKEN,
  SESSION_COOKIE,
  SESSION_SERVICE_TOKEN,
} from '../tokens';
import type { ApiEnv } from '../env';
import type { AuthService } from './auth.service';
import { readCookie, readIp, sessionCookieOptions } from './cookies';
import { AuthGuard, type RequestUser } from './guards';
import type { RateLimitService } from './rate-limit.service';
import type { SessionService } from './session.service';

const registerSchema = z.object({
  email: z.email({ message: '邮箱格式不正确' }),
  password: z.string().min(8, '密码至少 8 位').max(200),
  displayName: z.string().min(1, '昵称不能为空').max(60),
});

const loginSchema = z.object({
  email: z.email({ message: '邮箱格式不正确' }),
  password: z.string().min(1).max(200),
});

const acceptInvitationSchema = z.object({ token: z.string().min(10).max(200) });

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new BadRequestException({ error: 'atlas.request.invalid', message: detail });
  }
  return parsed.data;
}

function userAgent(request: Request): string {
  return (request.headers['user-agent'] ?? '').slice(0, 200);
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE_TOKEN) private readonly authService: AuthService,
    @Inject(SESSION_SERVICE_TOKEN) private readonly sessionService: SessionService,
    @Inject(RATE_LIMIT_SERVICE_TOKEN) private readonly rateLimit: RateLimitService,
    @Inject(ENV_TOKEN) private readonly env: ApiEnv,
  ) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseBody(registerSchema, body);
    this.rateLimit.check(`auth:${readIp(request) ?? 'unknown'}:${input.email}`);
    const result = await this.authService.register(
      input,
      { ip: readIp(request), device: userAgent(request) },
      this.env.SESSION_TTL_DAYS,
    );
    this.applySessionCookie(response, result.session.token);
    return { data: { user: result.user } };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseBody(loginSchema, body);
    this.rateLimit.check(`auth:${readIp(request) ?? 'unknown'}:${input.email}`);
    const result = await this.authService.login(
      input,
      { ip: readIp(request), device: userAgent(request) },
      this.env.SESSION_TTL_DAYS,
    );
    this.applySessionCookie(response, result.session.token);
    return { data: { user: result.user } };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.sessionService.revoke(token);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: Request) {
    const user = request.user as RequestUser;
    return { data: { user: await this.authService.me(user.id) } };
  }

  @Post('invitations/accept')
  @UseGuards(AuthGuard)
  async acceptInvitation(@Body() body: unknown, @Req() request: Request) {
    const user = request.user as RequestUser;
    const { token } = parseBody(acceptInvitationSchema, body);
    const joined = await this.authService.acceptInvitation(user.id, token);
    return { data: joined };
  }

  private applySessionCookie(response: Response, token: string): void {
    response.cookie(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(
        this.env.SESSION_TTL_DAYS * 24 * 60 * 60,
        this.env.NODE_ENV === 'production',
      ),
    );
  }
}
