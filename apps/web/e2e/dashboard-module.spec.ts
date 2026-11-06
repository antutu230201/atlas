import { expect, test } from '@playwright/test';

const password = 'password123';

/** 20 秒静音 WAV：只替换音乐平台的网络音频，仍由真实 HTMLAudioElement 驱动全部交互。 */
function createTestAudio() {
  const sampleRate = 8_000;
  const dataSize = sampleRate * 20 * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test.describe('个人大屏模块（假数据源）', () => {
  test('启用 → 首启引导选城市 → 时钟/天气/热榜/滚动头条可见', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `dash-e2e-a-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏验收A');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('大屏验收空间A');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('大屏验收空间A').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-dashboard');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    await page.goto('/m/dashboard/screen');

    // 未设置城市 → 设置抽屉自动弹出引导（模态抽屉会 aria-hidden 页面其余部分，
    // 因此页面标题等断言统一放到抽屉关闭之后）
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible({ timeout: 15_000 });

    // 定位失败也可搜索：假数据源返回杭州
    await drawer.getByLabel('搜索城市').fill('杭州');
    await drawer.getByRole('button', { name: '搜索' }).click();
    await drawer.getByRole('button', { name: /杭州/ }).first().click();

    // 抽屉关闭，天气卡出现（假数据：晴间多云）
    await expect(drawer).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible();
    await expect(page.getByText('杭州').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('晴间多云').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '打开命令面板' })).toHaveCount(0);

    // 天气卡可打开完整详情，包含逐时与逐日预报
    await page.getByRole('button', { name: '查看天气详情', exact: true }).click();
    const weatherDialog = page.getByRole('dialog', { name: '杭州 · 天气详情' });
    await expect(weatherDialog).toBeVisible();
    await expect(weatherDialog.getByRole('heading', { name: '逐时天气' })).toBeVisible();
    await expect(weatherDialog.getByRole('heading', { name: '未来几天' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(weatherDialog).not.toBeVisible();

    // 调用浏览器 Fullscreen API；退出后恢复应用外壳
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0);
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();

    // 时钟走时（role=timer）
    await expect(page.getByRole('timer', { name: '当前时间' })).toBeVisible();

    // 热榜卡片（假数据源 ×5）
    await expect(page.getByText('微博热搜').first()).toBeVisible();
    await expect(page.getByText('抖音热搜').first()).toBeVisible();
    await expect(page.getByText('测试热搜第 1 条').first()).toBeVisible();

    // 滚动头条
    await expect(page.getByRole('marquee', { name: '滚动头条' })).toBeVisible();

    // 一言
    await expect(page.getByText(/「.+」/).first()).toBeVisible();

    // 挂墙低功耗：关闭壁纸/天气氛围且持续动画停止，偏好刷新后保留
    const lowPower = page.getByRole('button', { name: '低功耗模式', exact: true });
    await expect(lowPower).toHaveAttribute('aria-pressed', 'false');
    await lowPower.click();
    await expect(lowPower).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.dashboard-screen')).toHaveAttribute('data-low-power', 'true');
    await expect(page.locator('.screen-backdrop')).toHaveCount(0);
    await expect(page.locator('.screen-weather')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: '低功耗模式', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.dashboard-screen')).toHaveAttribute('data-low-power', 'true');
  });

  test('倒计时增删 + 数据源开关立即生效', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `dash-e2e-b-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏验收B');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('大屏验收空间B');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('大屏验收空间B').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    const card = page.getByTestId('module-card-dashboard');
    await card.getByRole('button', { name: '启用' }).click({ timeout: 10_000 });

    await page.goto('/m/dashboard/screen');

    // 先等自动弹出的设置抽屉（模态期间页面其余部分 aria-hidden），关掉它再断言页面
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible();

    // 创建倒计时（置顶星）
    await page.getByLabel('倒计时名称').fill('项目上线');
    await page.getByLabel('目标日期').fill('2030-12-31');
    await page.getByRole('button', { name: '添加倒计时' }).click();
    await expect(page.getByText('项目上线')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/还有 \d+ 天/).first()).toBeVisible();

    // 删除 → 卡片消失
    await page.getByLabel('删除 项目上线').click();
    await expect(page.getByText('项目上线')).toHaveCount(0, { timeout: 10_000 });

    // 设置抽屉：关掉抖音源 → 卡片消失；回收站里有刚删除的倒计时
    await page.getByRole('button', { name: '设置' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('项目上线')).toBeVisible();
    await drawer.getByLabel('启用或停用抖音热搜').click();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('抖音热搜')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('微博热搜').first()).toBeVisible();
  });

  test('黑胶播放器：播放/暂停 → 切歌 → 歌单选曲', async ({ page }) => {
    test.setTimeout(60_000);
    // 必须支持 Range：完整 200 响应下浏览器 seekable.end=0，歌词跳播会被媒体层拒绝。
    await page.route('https://music.163.com/song/media/outer/url**', (route) => {
      const body = createTestAudio();
      const range = route.request().headers()['range'];
      const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
      if (match) {
        const start = Number(match[1]);
        const end = Math.min(Number(match[2] || body.length - 1), body.length - 1);
        return route.fulfill({
          status: 206,
          headers: {
            'content-type': 'audio/wav',
            'accept-ranges': 'bytes',
            'content-range': `bytes ${start}-${end}/${body.length}`,
            'content-length': String(end - start + 1),
          },
          body: body.subarray(start, end + 1),
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'audio/wav',
          'accept-ranges': 'bytes',
          'content-length': String(body.length),
        },
        body,
      });
    });

    const email = `dash-e2e-music-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏音乐验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');

    await page.getByRole('button', { name: '+ 新建工作空间' }).click();
    await page.getByLabel('工作空间名称').fill('大屏音乐空间');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('大屏音乐空间').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/settings');
    await page.getByRole('button', { name: '模块', exact: true }).click();
    await page
      .getByTestId('module-card-dashboard')
      .getByRole('button', { name: '启用' })
      .click({ timeout: 10_000 });
    await page.goto('/m/dashboard/screen');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const player = page.getByTestId('vinyl-player');
    const disc = page.getByTestId('vinyl-disc');
    await expect(player).toBeVisible();
    await expect(player).toBeInViewport();
    await expect(disc).toHaveAttribute('data-playing', 'false');

    // 悬浮舱不随页面滚动移动：首屏直接可播，滚到底仍停在右下角。
    const dockBefore = await player.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    const dockAfter = await player.boundingBox();
    expect(dockBefore).not.toBeNull();
    expect(dockAfter).not.toBeNull();
    expect(Math.abs((dockAfter?.y ?? 0) - (dockBefore?.y ?? 0))).toBeLessThan(1);
    await expect(player).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByRole('button', { name: '播放 消愁', exact: true }).click();
    await expect(disc).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(() => player.locator('audio').evaluate((audio) => !(audio as HTMLAudioElement).paused))
      .toBe(true);

    await page.getByRole('button', { name: '暂停 消愁', exact: true }).click();
    await expect(disc).toHaveAttribute('data-playing', 'false');

    await page.getByRole('button', { name: '展开播放器', exact: true }).click();
    await expect(player.getByRole('heading', { name: '消愁' })).toBeVisible();

    // 桌面歌词：两行 → 点下一句跳播 → 换色 → 拖动 → 关闭。
    await page.getByRole('button', { name: '歌词', exact: true }).click();
    const lyrics = page.getByRole('region', { name: '桌面歌词' });
    await expect(lyrics).toBeVisible();
    await expect(lyrics.getByText(/假数据歌词/).first()).toBeVisible();
    const lyricLines = lyrics.getByRole('button', { name: /跳到|回到/ });
    await expect(lyricLines).toHaveCount(2);

    await lyricLines.nth(1).click();
    await expect
      .poll(() =>
        player.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0.5);

    await lyrics.getByRole('button', { name: '歌词设置', exact: true }).click();
    await lyrics.getByRole('button', { name: '歌词颜色：粉色' }).click();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('atlas.dashboard.lyrics-color')))
      .toBe('var(--screen-pink)');
    await lyrics.getByRole('button', { name: '单行', exact: true }).click();
    await expect(lyricLines).toHaveCount(1);
    await lyrics.getByRole('button', { name: '双行', exact: true }).click();
    await expect(lyricLines).toHaveCount(2);
    await lyrics.getByRole('button', { name: '歌词设置', exact: true }).click();

    const handle = page.getByTestId('lyrics-drag-handle');
    const lyricsBefore = await lyrics.boundingBox();
    const handleBox = await handle.boundingBox();
    expect(lyricsBefore).not.toBeNull();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + 60, handleBox.y + 12);
      await page.mouse.down();
      await page.mouse.move(handleBox.x - 80, handleBox.y + 70, { steps: 6 });
      await page.mouse.up();
    }
    const lyricsAfter = await lyrics.boundingBox();
    expect(lyricsAfter).not.toBeNull();
    expect(Math.abs((lyricsAfter?.x ?? 0) - (lyricsBefore?.x ?? 0))).toBeGreaterThan(10);

    await page.getByRole('button', { name: '关闭桌面歌词', exact: true }).click();
    await expect(lyrics).not.toBeVisible();

    // 暂停状态切歌只换曲，不擅自出声。
    await page.getByRole('button', { name: '下一首', exact: true }).click();
    await expect(player.getByRole('heading', { name: '理想三旬' })).toBeVisible();
    await expect(disc).toHaveAttribute('data-playing', 'false');

    await page.getByRole('button', { name: '歌单', exact: true }).click();
    await expect(page.getByText('Atlas 精选 · 可网页播放')).toBeVisible();
    await page.getByRole('button', { name: /^播放 起风了 - / }).click();
    await expect(player.getByRole('heading', { name: '起风了' })).toBeVisible();
    await expect(disc).toHaveAttribute('data-playing', 'true');

    // 手机宽度：展开面板不横向溢出，可收起为贴底迷你舱。
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobile = await player.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(mobile.width).toBeLessThanOrEqual(390);
    expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.clientWidth + 1);

    await page.getByRole('button', { name: '收起播放器', exact: true }).click();
    await expect(page.getByRole('button', { name: '展开播放器', exact: true })).toBeVisible();
  });
});
