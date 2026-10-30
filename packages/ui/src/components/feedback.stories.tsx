import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

const meta = {
  title: 'Feedback',
} satisfies Meta;

export default meta;

export const SkeletonStory: StoryObj = {
  name: 'Skeleton',
  render: () => (
    <div className="w-80 space-y-3 rounded-md border border-border bg-surface p-5" aria-busy="true">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  ),
};

export const EmptyStateStory: StoryObj = {
  name: 'EmptyState',
  render: () => (
    <div className="w-96">
      <EmptyState
        title="还没有待办"
        description="创建第一件待办，开始今天最重要的事。"
        action={<Button size="sm">新建待办</Button>}
      />
    </div>
  ),
};
