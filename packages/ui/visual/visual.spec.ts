import { expect, test } from '@playwright/test';

const STORYBOOK_URL = 'http://localhost:6006';

interface StoryIndexEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

async function getStories(): Promise<StoryIndexEntry[]> {
  const response = await fetch(`${STORYBOOK_URL}/index.json`);
  const index = (await response.json()) as { entries: Record<string, StoryIndexEntry> };
  return Object.values(index.entries).filter((entry) => entry.type === 'story');
}

/**
 * 视觉回归：每个故事一张整页截图，与按平台存放的基线对比。
 * 当前仅在本地运行生成基线（差异容忍 5%）；推送到 GitHub 后在 CI 生成基线并启用门禁（见 roadmap）。
 */
test('全部故事截图与基线一致', async ({ page }) => {
  test.skip(!!process.env.CI, 'CI 视觉基线待首次推送后生成再启用门禁');

  const stories = await getStories();
  expect(stories.length).toBeGreaterThan(10);

  for (const story of stories) {
    await test.step(`${story.title} · ${story.name}`, async () => {
      await page.goto(`${STORYBOOK_URL}/iframe.html?id=${story.id}&viewMode=story`);
      await page.waitForTimeout(350); // 等待渲染与字体稳定
      await expect(page).toHaveScreenshot(`${story.id}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
      });
    });
  }
});
