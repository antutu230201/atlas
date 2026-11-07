import { Body, Controller, Get, HttpCode, Inject, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { AuthGuard, type RequestUser } from '../auth/guards';
import { AI_ADAPTER_TOKEN } from '../tokens';
import { ConfigurableAIProvider } from './ai-config.service';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

/**
 * AI 配置表单补丁：apiKey 三态——undefined 保持不变；null/'' 清除（回落 env/Mock）；非空设置。
 */
const configPatchSchema = z.object({
  apiKey: z.string().max(400).optional().nullable(),
  baseUrl: z.string().url('Base URL 必须是合法 URL').max(300).optional(),
  model: z.string().trim().min(1, '模型名不能为空').max(120).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(120_000).optional(),
});

const buildSystemPrompt = (name: string) => `你是 Atlas 的个人成长助手，用户是 ${name}。你帮助用户：
1. 反思今天的经历和感受
2. 将大目标分解为可执行的小步骤
3. 提供每周复盘的引导问题
4. 在用户低落时给予温暖的鼓励

风格：温暖但不油腻，直接但不冷酷，像一位智慧的老朋友。
回答保持简洁（通常 2-4 句话），除非用户明确要求详细解释。
用中文回答。`;

@Controller('ai')
@UseGuards(AuthGuard)
export class AIController {
  constructor(@Inject(AI_ADAPTER_TOKEN) private readonly ai: ConfigurableAIProvider) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Req() request: Request, @Body() body: { message: string }) {
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return { data: { text: '消息不能为空' } };
    }
    const user = request.user as RequestUser;
    const result = await this.ai.complete({
      prompt: parsed.data.message,
      system: buildSystemPrompt(user.displayName),
      maxTokens: 1024,
      temperature: 0.7,
    });
    return { data: { text: result.text, model: result.model } };
  }

  /** 当前 AI 配置（key 只回掩码，明文永不出库） */
  @Get('config')
  getConfig() {
    return { data: this.ai.describe() };
  }

  /** 保存配置：登录即可改（部署级，自用阶段），写入审计由全局 interceptor 覆盖，key 已脱敏 */
  @Put('config')
  @HttpCode(200)
  async putConfig(@Req() request: Request, @Body() body: unknown) {
    const parsed = configPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return { error: 'atlas.ai.invalid-config', message: parsed.error.issues[0]?.message };
    }
    const user = request.user as RequestUser;
    const view = await this.ai.applyPatch(parsed.data, user.id);
    return { data: view };
  }

  /** 测试连接：用提交的表单值（不落库、不切换）发一条最小请求 */
  @Post('config/test')
  async testConfig(@Body() body: unknown) {
    const parsed = configPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return { data: { ok: false, error: parsed.error.issues[0]?.message ?? '参数错误' } };
    }
    const probe = this.ai.probePatch(parsed.data);
    if (!probe) {
      return { data: { ok: false, error: '尚未填写 API Key' } };
    }
    try {
      const result = await probe.complete({
        prompt: '连接测试：请只回复"连接成功"四个字。',
        // 推理型模型会先消耗 token 再出正文，给太小会拿到空内容
        maxTokens: 64,
        temperature: 0,
      });
      return { data: { ok: true, model: result.model, sample: result.text.slice(0, 80) } };
    } catch (error) {
      return {
        data: {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
