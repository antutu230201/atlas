/**
 * AI 适配器接口（ADR-0005 阶段 5）：
 * 外部 AI 供应商一律走此接口（OpenAI / 智谱 / 本地模型…），换供应商零改业务代码。
 * 本地开发用 MockAIProvider；生产配置真实供应商的 API 密钥（环境变量注入）。
 */

export interface AICompletionRequest {
  /** 系统提示词（角色设定、约束） */
  system?: string;
  /** 用户消息 */
  prompt: string;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 温度 0–2 */
  temperature?: number;
}

export interface AICompletionResponse {
  text: string;
  /** 供应商返回的原始模型名 */
  model: string;
  /** token 用量（用于计费追踪） */
  usage: { promptTokens: number; completionTokens: number };
}

export interface AIAdapter {
  readonly name: string;
  /** 供应商是否已配置（有 API 密钥等） */
  isReady(): boolean;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

/** 本地开发 Mock：返回模板化响应，不调用外部 API */
export class MockAIProvider implements AIAdapter {
  readonly name = 'ai-mock';

  isReady(): boolean {
    return true;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const promptPreview = request.prompt.slice(0, 60);
    const text = [
      `[MockAI] 收到请求（${promptPreview}…）`,
      request.system ? `系统角色：${request.system.slice(0, 40)}` : '',
      '这是本地 Mock 供应商的模板化响应。配置真实 AI 供应商后，此内容将被模型生成结果替换。',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      text,
      model: 'mock-1',
      usage: {
        promptTokens: Math.ceil(request.prompt.length / 4),
        completionTokens: Math.ceil(text.length / 4),
      },
    };
  }
}
