import { describe, expect, it } from 'vitest';
import { buildJournalReportHtml } from '@atlas/module-journal/web/review-report';
import type { EntryView } from '@atlas/module-journal';

/** 复盘月度报告模板：纯前端聚合推导，HTML 自包含、零 AI */

const entry = (overrides: Partial<EntryView>): EntryView => ({
  id: overrides.id ?? crypto.randomUUID(),
  kind: overrides.kind ?? 'daily',
  day: overrides.day ?? '2026-11-01',
  mood: overrides.mood ?? null,
  content: overrides.content ?? '',
  aiText: overrides.aiText ?? null,
  aiPolishedAt: overrides.aiPolishedAt ?? null,
  updatedAt: overrides.updatedAt ?? '2026-11-01T00:00:00.000Z',
});

describe('buildJournalReportHtml', () => {
  const entries: EntryView[] = [
    entry({ day: '2026-11-01', mood: 5, content: '状态很好，完成了长跑。', aiText: '✦润色' }),
    entry({ day: '2026-11-02', mood: 3, content: '一般，有点累。'.repeat(3) }),
    entry({ day: '2026-11-15', kind: 'weekly', content: '本周主线推进。' }),
    entry({ day: '2026-11-03', mood: null, content: '没选心情' }),
  ];
  const html = buildJournalReportHtml({
    month: '2026-11',
    generatedAt: new Date('2026-11-15T12:00:00'),
    entries,
    summary: { monthDaily: 3, monthWeekly: 1, streak: 4 },
  });

  it('自包含 HTML：doctype + 内联样式 + 打印按钮，无外部资源引用', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('打印 / 存 PDF');
    expect(html).not.toMatch(/src="http|href="http/);
  });

  it('标题与月份：2026 年 11 月', () => {
    expect(html).toContain('<title>Atlas 复盘报告 · 2026 年 11 月</title>');
    expect(html).toContain('2026 年 11 月');
  });

  it('聚合统计：3 篇日记 / 1 篇周复盘 / 平均心情 4（5+3)/2 / 字数合计', () => {
    expect(html).toContain('这个月你写了 <b>3</b> 篇日记、<b>1</b> 篇周复盘');
    expect(html).toContain('平均心情 <b>4</b> / 5');
    // 11 + 21 + 7 + 4 = 43
    expect(html).toContain('累计 <b>43</b> 字');
    expect(html).toContain('连续 4 天复盘');
  });

  it('心情分布：5 分 1 天、3 分 1 天；未记录不计入分布', () => {
    expect(html).toContain('很好</span>');
    expect(html).toContain('1 天</span>');
    expect(html).toContain('一般</span>');
  });

  it('条目列表：日记与周复盘分开，全文渲染且转义，AI 段落标记', () => {
    expect(html).toContain('11 月 1 日 · 😄 很好');
    expect(html).toContain('完成了长跑。');
    expect(html).toContain('本周主线推进。');
    expect(html).toContain('✦ ✦润色');
    // 用户内容必须转义后进入 HTML
    const withAngle = buildJournalReportHtml({
      month: '2026-11',
      generatedAt: new Date(),
      entries: [entry({ content: '<script>alert(1)</script>' })],
      summary: { monthDaily: 1, monthWeekly: 0, streak: 0 },
    });
    expect(withAngle).not.toContain('<script>alert(1)</script>');
    expect(withAngle).toContain('&lt;script&gt;');
  });

  it('空月：友好空态而非崩溃', () => {
    const empty = buildJournalReportHtml({
      month: '2026-10',
      generatedAt: new Date(),
      entries: [],
      summary: { monthDaily: 0, monthWeekly: 0, streak: 0 },
    });
    expect(empty).toContain('这个月还没有复盘记录');
    expect(empty).toContain('这个月还没有心情记录');
    expect(empty).toContain('这个月还没有日记。');
  });

  it('11 月趋势柱状图：30 根柱子，1 日为最佳心情 active 标记', () => {
    expect(html.match(/class="bar-col/g)?.length).toBe(30);
    expect(html).toContain('bar-col peak active');
  });
});
