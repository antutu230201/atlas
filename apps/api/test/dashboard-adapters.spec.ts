import { describe, expect, it } from 'vitest';
import {
  describeWeatherCode,
  normalizeBaidu,
  normalizeBilibili,
  normalizeDouyin,
  normalizeToutiao,
  normalizeWeibo,
  parseLrc,
} from '@atlas/module-dashboard';

/** 大屏适配器归一化：各源真实响应形状的子集 → HotItem[]（缺字段跳过、不抛错） */

describe('dashboard 适配器归一化', () => {
  it('微博：word/realpos/num/icon_desc → rank/title/heat/tag，链接用 word_scheme', () => {
    const items = normalizeWeibo({
      ok: 1,
      data: {
        realtime: [
          { word: '热搜一', num: 4_512_300, realpos: 1, icon_desc: '热', word_scheme: '#热搜一#' },
          { note: '无 word 字段', num: 10, realpos: 2 },
          {},
        ],
      },
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      rank: 1,
      title: '热搜一',
      heat: 4_512_300,
      tag: '热',
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent('#热搜一#')}`,
    });
    expect(items[1]!.title).toBe('无 word 字段');
  });

  it('抖音：word_list 顺序即排名', () => {
    const items = normalizeDouyin({
      data: { word_list: [{ word: '话题A', hot_value: 9_876_543 }] },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ rank: 1, title: '话题A', heat: 9_876_543 });
    expect(items[0]!.url).toContain('douyin.com/search');
  });

  it('B站：show_name 优先于 keyword', () => {
    const items = normalizeBilibili({
      code: 0,
      data: { trending: { list: [{ keyword: 'kw', show_name: '展示名', heat_score: 1_000 }] } },
    });
    expect(items[0]!.title).toBe('展示名');
    expect(items[0]!.url).toContain(encodeURIComponent('kw'));
  });

  it('百度：cards 两层嵌套拍平 + isTop → 置顶', () => {
    const items = normalizeBaidu({
      data: {
        cards: [
          {
            content: [
              { word: '置顶条', isTop: true, url: 'https://m.baidu.com/s?word=x' },
              { content: [{ word: '嵌套条', hotScore: '12345' }] },
            ],
          },
        ],
      },
    });
    expect(items.map((i) => i.title)).toEqual(['置顶条', '嵌套条']);
    expect(items[0]!.tag).toBe('置顶');
    expect(items[1]!.heat).toBe(12_345);
    expect(items[1]!.url).toContain('baidu.com/s?wd=');
  });

  it('头条：Title/Url/HotValue 直映', () => {
    const items = normalizeToutiao({
      data: [{ Title: '头条一', Url: 'https://www.toutiao.com/trending/1', HotValue: 88_800 }],
    });
    expect(items[0]).toMatchObject({
      rank: 1,
      title: '头条一',
      heat: 88_800,
      url: 'https://www.toutiao.com/trending/1',
    });
  });

  it('各归一化对畸形输入返回空数组而不抛错', () => {
    expect(normalizeWeibo({})).toEqual([]);
    expect(normalizeDouyin({ data: {} })).toEqual([]);
    expect(normalizeBilibili({ data: { trending: {} } })).toEqual([]);
    expect(normalizeBaidu({ data: { cards: [{}] } })).toEqual([]);
    expect(normalizeToutiao({})).toEqual([]);
  });

  it('WMO 天气码 → 中文描述与图标键', () => {
    expect(describeWeatherCode(0)).toEqual({ text: '晴', icon: 'sun' });
    expect(describeWeatherCode(61).text).toBe('小雨');
    expect(describeWeatherCode(95).icon).toBe('thunder');
    expect(describeWeatherCode(999).text).toBe('未知');
  });
});

describe('LRC 歌词解析', () => {
  it('解析多时间标签、百分秒与毫秒，过滤制作人员并保持时间升序', () => {
    const lines = parseLrc(
      [
        '[00:00.000] 作词 : 某人',
        '[00:01.50]第一句',
        '[00:02.123][00:05.000]重复副歌',
        '[00:03.000]',
        '[ar:测试歌手]',
        '[00:04.9]最后一句',
      ].join('\n'),
    );
    expect(lines).toEqual([
      { time: 1.5, text: '第一句' },
      { time: 2.123, text: '重复副歌' },
      { time: 4.9, text: '最后一句' },
      { time: 5, text: '重复副歌' },
    ]);
  });

  it('无有效歌词或纯元数据返回空数组', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('[ti:标题]\n[ar:歌手]')).toEqual([]);
  });
});
