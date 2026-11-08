import axeCore from 'axe-core';
import type { Page } from '@playwright/test';

/** axe 的扫描结果只保留需要修的问题，避免刷屏 */
export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  helpUrl: string;
  nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
}

interface AxeWindow extends Window {
  axe?: {
    run(context: Document, options: unknown): Promise<{ violations: AxeViolation[] }>;
  };
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * 在应用页面上跑 axe：复用 packages/ui 门禁同款引擎（axe-core 4.14），
 * 只覆盖 WCAG 2.1 A/AA 规则，返回 serious/critical 命中项。
 */
export async function scanPage(page: Page): Promise<AxeViolation[]> {
  const injected = await page.evaluate(() => Boolean((window as unknown as AxeWindow).axe));
  if (!injected) {
    await page.addScriptTag({ content: axeCore.source });
  }
  const results = await page.evaluate(async (tags) => {
    const axe = (window as unknown as AxeWindow).axe;
    if (!axe) throw new Error('axe 未注入');
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: tags },
      resultTypes: ['violations'],
    });
    return result.violations;
  }, TAGS);

  return results.filter((item) => item.impact === 'serious' || item.impact === 'critical');
}

export function describeViolations(violations: AxeViolation[]): string {
  return violations
    .map(
      (item) =>
        `- [${item.impact}] ${item.id}: ${item.help} (${item.nodes.length} 处) → ${item.nodes
          .slice(0, 3)
          .map(
            (node) =>
              `${node.target.join(' ')} :: ${node.html.slice(0, 140)}${
                node.failureSummary ? `\n    原因：${node.failureSummary.replace(/\n/g, ' ')}` : ''
              }`,
          )
          .join(' | ')}`,
    )
    .join('\n');
}
