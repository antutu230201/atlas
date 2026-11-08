import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const STORYBOOK_URL = 'http://localhost:6006';

interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: unknown[];
}

interface AxeResults {
  violations: AxeViolation[];
}

const axeScript = readFileSync(
  path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js'),
  'utf8',
);

async function getStories(): Promise<StoryIndexEntry[]> {
  const response = await fetch(`${STORYBOOK_URL}/index.json`);
  const index = (await response.json()) as { entries: Record<string, StoryIndexEntry> };
  return Object.values(index.entries).filter((entry) => entry.type === 'story');
}

test('全部故事通过 axe 无障碍检查（serious / critical 为零）', async ({ page }) => {
  const stories = await getStories();
  expect(stories.length).toBeGreaterThan(10);

  const problems: string[] = [];
  for (const story of stories) {
    await test.step(`${story.title} · ${story.name}`, async () => {
      await page.goto(`${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story`);
      await page.waitForTimeout(300); // 等待 Radix 挂载与字体/样式稳定
      await page.addScriptTag({ content: axeScript });
      const results = await page.evaluate(async (): Promise<AxeResults> => {
        const axe = (
          window as unknown as {
            axe: {
              run: (context: Document, options: object) => Promise<AxeResults>;
              _running?: boolean;
            };
          }
        ).axe;
        // Storybook's addon-a11y also runs axe on story navigation. Wait for that
        // audit to finish so this gate doesn't race it on the shared iframe.
        for (let attempt = 0; axe._running && attempt < 100; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (axe._running) throw new Error('Storybook axe audit did not finish in time');
        return await axe.run(document, { resultTypes: ['violations'] });
      });
      for (const violation of results.violations) {
        if (violation.impact === 'serious' || violation.impact === 'critical') {
          problems.push(
            `[${story.id}] ${violation.id}(${violation.impact}): ${violation.help} — 影响节点 ${violation.nodes.length} 个`,
          );
        }
      }
    });
  }

  expect(problems, `发现无障碍严重问题：\n${problems.join('\n')}`).toHaveLength(0);
});
