import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { canModule } from '@atlas/core';
import { ModuleActionError } from '@atlas/sdk';
import type { Request } from 'express';
import { withUser } from '../../db/tenant';
import type { Db } from '../../db/client';
import { DB_TOKEN, MODULE_REGISTRY_SERVICE_TOKEN, MODULE_SERVICE_TOKEN } from '../../tokens';
import { AuthGuard, RequireWorkspace, type RequestUser } from '../../auth/guards';
import type { ModuleRegistryService } from './module-registry';
import type { ModuleService } from './module.service';

/**
 * 模块系统网关（ADR-0005 §7）。
 * 模块服务端不注册 Nest 控制器，统一经 POST .../call/:action 分发：
 * 守卫链负责 认证 → 工作空间成员 → 模块启用 → 权限点 → 事务内构造 ModuleContext。
 */
@Controller('modules')
@UseGuards(AuthGuard)
export class ModuleController {
  constructor(
    @Inject(MODULE_SERVICE_TOKEN) private readonly moduleService: ModuleService,
    @Inject(MODULE_REGISTRY_SERVICE_TOKEN) private readonly registry: ModuleRegistryService,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  /** 内核级目录：本进程可发现的全部模块 */
  @Get()
  async catalog() {
    return { data: await this.moduleService.catalog() };
  }

  @Get('workspaces/:slug')
  @RequireWorkspace()
  async listForWorkspace(@Req() request: Request) {
    const user = request.user as RequestUser;
    return { data: await this.moduleService.listForWorkspace(request.workspace!.id, user.id) };
  }

  @Post('workspaces/:slug/:name/enable')
  @RequireWorkspace('module:manage')
  async enable(@Param('name') name: string, @Req() request: Request) {
    const user = request.user as RequestUser;
    const enabled = await this.moduleService.enable(request.workspace!.id, user.id, name);
    return { data: { enabled, name } };
  }

  @Post('workspaces/:slug/:name/disable')
  @RequireWorkspace('module:manage')
  async disable(@Param('name') name: string, @Req() request: Request) {
    const user = request.user as RequestUser;
    await this.moduleService.disable(request.workspace!.id, user.id, name);
    return { data: { disabled: name } };
  }

  /**
   * 统一调用网关：POST /v1/modules/workspaces/:slug/:name/call/:action
   * 一个调用 = 一个租户事务；handler 内所有读写同事务（含事件 outbox 落库）。
   */
  @Post('workspaces/:slug/:name/call/:action')
  @HttpCode(200)
  @RequireWorkspace()
  async call(
    @Param('name') name: string,
    @Param('action') actionName: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const user = request.user as RequestUser;
    const role = request.role!;
    const mod = await this.registry.get(name);
    if (!mod) {
      throw new BadRequestException({
        error: 'atlas.module.unknown',
        message: `模块 ${name} 不存在`,
      });
    }
    const install = await this.moduleService.getInstall(request.workspace!.id, user.id, name);
    if (!install || install.status !== 'enabled') {
      throw new ConflictException({
        error: 'atlas.module.not-enabled',
        message: `模块 ${name} 未启用`,
      });
    }
    const action = mod.definition.actions[actionName];
    if (!action) {
      throw new BadRequestException({
        error: 'atlas.module.unknown-action',
        message: `模块 ${name} 没有动作 ${actionName}`,
      });
    }
    if (!canModule(role, action.permission)) {
      throw new ForbiddenException({
        error: 'atlas.auth.forbidden',
        message: `缺少权限 ${action.permission}`,
      });
    }

    let result: unknown;
    try {
      result = await withUser(this.db, user.id, async (tx) => {
        const context = this.moduleService.buildContext(mod, {
          tx,
          userId: user.id,
          displayName: user.displayName,
          workspaceId: request.workspace!.id,
          role,
        });
        return action.handler(context, body ?? {});
      });
    } catch (error) {
      // 模块业务错误（校验失败/资源不存在）映射为 400；其余按 500 交给全局处理
      if (error instanceof ModuleActionError) {
        throw new BadRequestException({
          error: 'atlas.module.action-failed',
          message: error.message,
        });
      }
      throw error;
    }
    return { data: result ?? null };
  }
}
