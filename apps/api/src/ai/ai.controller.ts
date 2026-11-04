import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { AuthGuard, type RequestUser } from '../auth/guards';
import { AI_ADAPTER_TOKEN } from '../tokens';
import type { AIAdapter } from '@atlas/core';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
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
  constructor(@Inject(AI_ADAPTER_TOKEN) private readonly ai: AIAdapter) {}

  @Post('chat')
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
}
