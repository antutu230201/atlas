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

/**
 * OpenAI 兼容供应商（阶段 5）：适用于任何实现 /chat/completions 协议的服务——
 * TokenRhythm（https://tokenrhythm.studio/v1）、DeepSeek、OpenAI、智谱等，换供应商只改 env。
 * 用原生 fetch，不引入 SDK 依赖；密钥只从环境变量注入，不落代码。
 */
export class OpenAICompatProvider implements AIAdapter {
  readonly name: string;

  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      model: string;
      /** 注册名（如 ai-tokenrhythm），用于日志与用量追踪 */
      name?: string;
      timeoutMs?: number;
    },
  ) {
    this.name = options.name ?? 'ai-openai-compat';
  }

  isReady(): boolean {
    return this.options.apiKey.length > 0;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const { baseUrl, apiKey, model, timeoutMs = 30_000 } = this.options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(request.system ? [{ role: 'system', content: request.system }] : []),
            { role: 'user', content: request.prompt },
          ],
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`AI 供应商返回 ${response.status}：${detail.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('AI 供应商返回了空内容');
      return {
        text,
        model: data.model ?? model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`AI 请求超时（${timeoutMs}ms）`);
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }
}
