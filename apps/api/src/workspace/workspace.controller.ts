import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { WORKSPACE_SERVICE_TOKEN } from '../tokens';
import { AuthGuard, RequireWorkspace, type RequestUser } from '../auth/guards';
import type { WorkspaceService } from './workspace.service';

const createSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{2,39}$/, 'slug 仅小写字母/数字/连字符，3–40 位')
    .optional(),
});

const inviteSchema = z.object({
  email: z.email({ message: '邮箱格式不正确' }),
  role: z.enum(['admin', 'member', 'guest']),
});

const roleSchema = z.object({ role: z.enum(['admin', 'member', 'guest']) });

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

function actor(request: Request): { userId: string; role: NonNullable<Request['role']> } {
  const user = request.user as RequestUser;
  return { userId: user.id, role: request.role ?? 'guest' };
}

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(
    @Inject(WORKSPACE_SERVICE_TOKEN) private readonly workspaceService: WorkspaceService,
  ) {}

  @Post()
  async create(@Body() body: unknown, @Req() request: Request) {
    const user = request.user as RequestUser;
    const input = parseBody(createSchema, body);
    return { data: await this.workspaceService.create(user.id, input) };
  }

  @Get()
  async listMine(@Req() request: Request) {
    const user = request.user as RequestUser;
    return { data: await this.workspaceService.listMine(user.id) };
  }

  @Get(':slug')
  @RequireWorkspace()
  async detail(@Req() request: Request) {
    const user = request.user as RequestUser;
    const workspaceData = await this.workspaceService.get(request.workspace!.id, user.id);
    return { data: { workspace: workspaceData, role: request.role } };
  }

  @Get(':slug/members')
  @RequireWorkspace()
  async members(@Req() request: Request) {
    const user = request.user as RequestUser;
    return { data: await this.workspaceService.listMembers(request.workspace!.id, user.id) };
  }

  @Post(':slug/members/invite')
  @RequireWorkspace('member:manage')
  async invite(@Body() body: unknown, @Req() request: Request) {
    const input = parseBody(inviteSchema, body);
    const invited = await this.workspaceService.invite(
      request.workspace!.id,
      actor(request),
      input,
    );
    return { data: invited };
  }

  @Patch(':slug/members/:userId')
  @RequireWorkspace('member:manage')
  async updateRole(
    @Param('userId') targetUserId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const { role } = parseBody(roleSchema, body);
    const updated = await this.workspaceService.updateMemberRole(
      request.workspace!.id,
      actor(request),
      targetUserId,
      role,
    );
    return { data: updated };
  }

  @Delete(':slug/members/:userId')
  @RequireWorkspace('member:manage')
  @HttpCode(204)
  async removeMember(
    @Param('userId') targetUserId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.workspaceService.removeMember(request.workspace!.id, actor(request), targetUserId);
  }

  @Get(':slug/audit')
  @RequireWorkspace('audit:read')
  async audit(
    @Req() request: Request,
    @Query('days') days?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const user = request.user as RequestUser;
    // days 只接受白名单值，防止任意数字扫全表；limit 上限 200 由 service 收口
    const parsedDays = Number(days);
    const allowedDays = new Set([7, 30, 90]);
    const parsedLimit = Number(limit);
    return {
      data: await this.workspaceService.listAudit(request.workspace!.id, user.id, {
        days: allowedDays.has(parsedDays) ? parsedDays : undefined,
        q: q?.trim() || undefined,
        limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      }),
    };
  }
}
