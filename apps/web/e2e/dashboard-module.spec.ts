import { expect, test, type Page } from '@playwright/test';

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
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

/** 拦截网易云音频外链并回静音 WAV：必须支持 Range，否则 seekable.end=0，歌词跳播会被媒体层拒绝。 */
function routeNeteaseAudio(page: Page) {
  return page.route('https://music.163.com/song/media/outer/url**', (route) => {
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
}

test.describe('个人大屏模块（假数据源）', () => {
  test('注册即得大屏 → 首启引导选城市 → 时钟/天气/热榜/滚动头条可见', async ({ page }) => {
    test.setTimeout(60_000);
    const email = `dash-e2e-a-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏验收A');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

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
    await expect(page.getByRole('button', { name: /搜索/ })).toHaveCount(0);

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

    // 热榜卡片（假数据源 ×3）
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
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

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
    await routeNeteaseAudio(page);

    const email = `dash-e2e-music-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('大屏音乐验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

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

    // 三种播放模式循环切换，并通过本地偏好保存。
    await page.getByRole('button', { name: '播放模式：顺序播放，点击切换' }).click();
    await expect(page.getByRole('button', { name: '播放模式：单曲循环，点击切换' })).toBeVisible();
    await page.getByRole('button', { name: '播放模式：单曲循环，点击切换' }).click();
    await expect(page.getByRole('button', { name: '播放模式：随机播放，点击切换' })).toBeVisible();

    await page.getByRole('button', { name: '歌单', exact: true }).click();
    await expect(page.getByText('Atlas 精选 · 未绑定网易云')).toBeVisible();
    await expect(page.getByText('18 首', { exact: true })).toBeVisible();

    // 搜索匹配歌名/歌手/专辑，保留原始索引，过滤后选曲仍能播对。
    await page.getByLabel('搜索歌单').fill('陈鸿宇');
    await expect(player.locator('#vinyl-playlist ol li')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '播放 途中 - 陈鸿宇' })).toBeVisible();
    await expect(page.getByRole('button', { name: '播放 行歌 - 陈鸿宇' })).toBeVisible();
    await page.getByLabel('搜索歌单').fill('不存在的歌曲');
    await expect(page.getByText('没有找到「不存在的歌曲」相关歌曲')).toBeVisible();
    await page.getByRole('button', { name: '查看全部 18 首' }).click();
    await expect(player.locator('#vinyl-playlist ol li')).toHaveCount(18);

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

    // 刷新恢复曲目与进度并续播（刷新前正在播放；测试浏览器放开自动播放限制，
    // 真实浏览器被策略拦截时则停在恢复的进度上，不打扰）。
    await page.reload();
    // 测试账号未设城市，刷新会自动拉起设置抽屉；关掉后再检查播放器恢复结果。
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /起风了.*展开播放详情/ })).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator('[data-testid="vinyl-player"] audio')
            .evaluate((audio) => (audio as HTMLAudioElement).paused),
        { timeout: 15_000 },
      )
      .toBe(false);
    await page.getByRole('button', { name: '展开播放器', exact: true }).click();
    await expect(page.getByRole('button', { name: '播放模式：随机播放，点击切换' })).toBeVisible();
  });

  test('网易云绑定流：扫码弹窗 → 绑定成功 → 播放喜欢列表 → 解绑回退', async ({ page }) => {
    test.setTimeout(90_000);
    await routeNeteaseAudio(page);

    // 网易云动作全部路由拦截：不依赖外网，也不依赖服务端假数据开关。
    // 有状态模拟真实流：未绑定 → 扫码确认 → 已绑定（喜欢列表） → 解绑 → 未绑定。
    // 假喜欢列表与歌词同源（900000+i），QR 弹窗只验证状态机（waiting → confirmed）。
    const likedTracks = Array.from({ length: 3 }, (_, i) => ({
      id: 900_000 + i,
      title: `网易云喜欢歌曲 ${i + 1}`,
      artist: `喜欢歌手 ${i + 1}`,
      album: '我的喜欢',
      cover: '',
      durationMs: 200_000 + i * 10_000,
    }));
    let pollCount = 0;
    let bound = false;

    await page.route('**/dashboard/call/neteaseQrStart', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { unikey: 'e2e-unikey-1', qrUrl: 'https://music.163.com/login?codekey=e2e' },
        }),
      }),
    );
    await page.route('**/dashboard/call/neteaseQrPoll', (route) => {
      pollCount += 1;
      if (pollCount < 2) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { status: 'waiting' } }),
        });
      }
      bound = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { status: 'confirmed', uid: 10086, nickname: '验收君' } }),
      });
    });
    await page.route('**/dashboard/call/neteaseLiked', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          bound
            ? { data: { bound: true, nickname: '验收君', tracks: likedTracks } }
            : { data: { bound: false, tracks: [] } },
        ),
      }),
    );
    await page.route('**/dashboard/call/neteaseSongUrl', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { url: 'https://music.163.com/song/media/outer/url?id=900000.mp3', type: 'mp3' },
        }),
      }),
    );
    await page.route('**/dashboard/call/neteaseUnbind', (route) => {
      bound = false;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { unbound: true } }),
      });
    });

    const email = `dash-e2e-netease-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('网易云验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    await page.goto('/m/dashboard/screen');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    const player = page.getByTestId('vinyl-player');
    await expect(player).toBeVisible();

    // 展开播放器 → 歌单面板：未绑定显示内置精选与登录入口
    await page.getByRole('button', { name: '展开播放器', exact: true }).click();
    await page.getByRole('button', { name: '歌单', exact: true }).click();
    await expect(player.getByText('Atlas 精选 · 未绑定网易云')).toBeVisible();

    // 登录弹窗：出现二维码后轮询，第二次轮询返回已确认；状态反馈由来源标签承担
    await player.getByRole('button', { name: '登录网易云' }).click();
    const dialog = page.getByTestId('netease-login-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('img[alt="网易云登录二维码"]')).toBeVisible();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // 绑定后曲目源切换为喜欢列表（最近喜欢在前），播放走拦截的 CDN 地址
    await expect(player.getByText('网易云 · 验收君')).toBeVisible();
    await expect(player.getByRole('heading', { name: '网易云喜欢歌曲 1' })).toBeVisible();
    await player
      .locator('#vinyl-playlist')
      .getByRole('button', { name: /播放 网易云喜欢歌曲 1/ })
      .click();
    await expect
      .poll(() => player.locator('audio').evaluate((audio) => !(audio as HTMLAudioElement).paused))
      .toBe(true);
    await expect
      .poll(() => player.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).src))
      .toContain('outer/url?id=900000');

    // 解绑：软删除后回到内置精选
    await player.getByRole('button', { name: '退出登录' }).click();
    await expect(player.getByText('Atlas 精选 · 未绑定网易云')).toBeVisible();
    await expect(player.getByRole('heading', { name: '消愁' })).toBeVisible();
  });

  test('播放器全局常驻：跨页面不断播，刷新后恢复曲目与进度并续播', async ({ page }) => {
    test.setTimeout(90_000);
    await routeNeteaseAudio(page);

    const email = `dash-e2e-global-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('全局播放验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    // 播放器在任意页面都有（Shell 全局挂载），不局限于大屏页
    await expect(page.getByTestId('vinyl-player')).toBeVisible();

    await page.goto('/m/dashboard/screen');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    const player = page.getByTestId('vinyl-player');
    const disc = page.getByTestId('vinyl-disc');
    await player.getByRole('button', { name: '播放 消愁', exact: true }).click();
    await expect(disc).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(
        () => player.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).currentTime),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(1);

    // 切到「今天」页：组件不卸载，播放不中断、进度继续走
    // 侧栏「今天」：用 href 精确定位，避免命中大屏里的「今日听歌」空态卡
    await page.locator('a[href="/"]').filter({ hasText: '今天' }).first().click();
    await expect(page.getByTestId('vinyl-player')).toBeVisible();
    await expect(disc).toHaveAttribute('data-playing', 'true');
    const beforeNavigate = await player
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime);
    await page.waitForTimeout(1_200);
    const afterNavigate = await player
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime);
    expect(afterNavigate).toBeGreaterThan(beforeNavigate);

    // 刷新：恢复同曲目与进度并自动续播（测试浏览器放开自动播放限制；
    // 真实浏览器被拦截时则停在恢复的进度上，不打扰）
    const beforeReload = await player
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime);
    await page.reload();
    // 测试账号未设城市，刷新会自动拉起设置抽屉；关掉后再检查续播结果。
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    const restored = page.getByTestId('vinyl-player');
    await expect(restored.getByRole('button', { name: /暂停 消愁/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() =>
        restored.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(beforeReload);
  });

  test('大屏主导与听歌统计：根路径即大屏，播放时长计入汇总与排名', async ({ page }) => {
    test.setTimeout(120_000);
    await routeNeteaseAudio(page);

    const email = `dash-e2e-listen-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByLabel('昵称').fill('听歌统计验收');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '创建账号' }).click();
    await page.waitForURL('/');
    // 注册即自动开通个人空间与大屏（ADR-0008），无需手动建空间

    // 大屏主导：注册后的根路径直接渲染个人大屏（不再需要进 /m/dashboard/screen）
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '个人大屏' })).toBeVisible({ timeout: 15_000 });
    // 未设城市 → 首启引导抽屉会以模态弹出并遮蔽其余交互，先关掉
    await page
      .getByRole('dialog')
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);
    await page.keyboard.press('Escape');

    // 延伸功能入口：从大屏顶栏进入听歌统计
    await page.getByRole('button', { name: '延伸功能' }).click();
    await page.getByRole('menuitem', { name: /听歌统计/ }).click();
    await expect(page.getByTestId('listening-stats')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('总时长')).toBeVisible();
    await expect(page.getByText('全站排名').first()).toBeVisible();

    // 播放一段时间 → 暂停触发冲账 → 时长计入周汇总；今日听歌卡出现并可跳转
    await page.goto('/m/dashboard/screen');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    const player = page.getByTestId('vinyl-player');
    await player.getByRole('button', { name: '播放 消愁', exact: true }).click();
    await expect(page.getByTestId('vinyl-disc')).toHaveAttribute('data-playing', 'true');
    await expect
      .poll(
        () => player.locator('audio').evaluate((audio) => (audio as HTMLAudioElement).currentTime),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(6);
    await player.getByRole('button', { name: /暂停 消愁/ }).click();
    // 等暂停触发的听歌心跳冲账完成再离开页面
    await page.waitForTimeout(500);

    await page.goto('/m/dashboard/listening');
    await expect(page.getByTestId('listening-stats')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: '周', exact: true }).click();
    await expect(page.getByText(/分钟|小时|秒/).first()).toBeVisible({ timeout: 15_000 });
    // 全站排名里能看到自己（标记（我））
    // 改版后排名：前十内标"我 · 第 N 名"，榜外钉"我的位置"行
    await expect(page.getByText(/我 · 第|我的位置/).first()).toBeVisible({ timeout: 15_000 });

    await page.goto('/m/dashboard/screen');
    await expect(page.getByTestId('listening-mini-card')).toBeVisible({ timeout: 15_000 });

    // 分享卡：一键生成 1080×1350 PNG
    await page.goto('/m/dashboard/listening');
    await expect(page.getByTestId('listening-stats')).toBeVisible({ timeout: 15_000 });
    const shareButton = page.getByRole('button', { name: '生成分享卡 PNG' });
    await expect(shareButton).toBeEnabled({ timeout: 15_000 });
    await shareButton.click();
    // 先选尺寸（4:5 / 1:1 / 9:16），再等下载
    const shareDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: /^4:5/ }).click();
    const shareCard = await shareDownload;
    expect(shareCard.suggestedFilename()).toMatch(
      /^atlas_listening_share_4x5_\d{4}-\d{2}-\d{2}\.png$/,
    );

    // 周报通知直达：切到上周并自动下载当期报告，URL 参数随即清理（刷新不重复下载）
    const reportDownload = page.waitForEvent('download');
    await page.goto('/m/dashboard/listening?range=lastWeek&download=1');
    const report = await reportDownload;
    expect(report.suggestedFilename()).toMatch(/^atlas_listening_report_lastWeek_/);
    await expect(page).toHaveURL(/\/m\/dashboard\/listening$/);
    await expect(page.getByRole('tab', { name: '上周' })).toHaveAttribute('aria-selected', 'true');

    // 统计页滚动时播放器应淡出避让，停滚后恢复可操作。
    const floatingPlayer = page.getByTestId('vinyl-player');
    await page.evaluate(() => window.dispatchEvent(new Event('wheel')));
    await expect
      .poll(() => floatingPlayer.evaluate((element) => Number(getComputedStyle(element).opacity)))
      .toBeLessThan(1);
    await page.waitForTimeout(500);
    await expect(floatingPlayer).toHaveCSS('opacity', '1');
  });
});
