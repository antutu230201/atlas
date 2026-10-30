import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, Tag } from './tag';

const meta = {
  title: 'Data',
} satisfies Meta;

export default meta;

export const Badges: StoryObj = {
  name: 'Badge',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>默认</Badge>
      <Badge variant="primary">进行中</Badge>
      <Badge variant="ok">已完成</Badge>
      <Badge variant="warn">即将到期</Badge>
      <Badge variant="err">已逾期</Badge>
      <Badge variant="info">说明</Badge>
    </div>
  ),
};

export const Tags: StoryObj = {
  name: 'Tag',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Tag onRemove={() => undefined}>深度工作</Tag>
      <Tag variant="ok" onRemove={() => undefined}>
        晨间习惯
      </Tag>
      <Tag variant="warn">待整理</Tag>
    </div>
  ),
};

export const TableStory: StoryObj = {
  name: 'Table',
  render: () => (
    <div className="w-120">
      <div className="w-full overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted">事项</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border last:border-0 hover:bg-surface-hover">
              <td className="px-3 py-2.5">整理季度复盘</td>
              <td className="px-3 py-2.5">
                <Badge variant="primary">进行中</Badge>
              </td>
            </tr>
            <tr
              className="border-b border-border last:border-0 hover:bg-surface-hover data-[selected]:bg-primary-soft"
              data-selected
            >
              <td className="px-3 py-2.5">晨间跑步 5km</td>
              <td className="px-3 py-2.5">
                <Badge variant="ok">已完成</Badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
};

export const PaginationStory: StoryObj = {
  name: 'Pagination',
  render: () => (
    <div className="flex items-center gap-2 text-sm text-muted">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-text"
      >
        ‹
      </button>
      <span>第 2 / 9 页</span>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-sm border border-border bg-surface text-text"
      >
        ›
      </button>
    </div>
  ),
};
