import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Breadcrumb } from './breadcrumb';

const meta = {
  title: 'Navigation',
} satisfies Meta;

export default meta;

export const TabsStory: StoryObj = {
  name: 'Tabs',
  render: () => (
    <Tabs defaultValue="today">
      <TabsList>
        <TabsTrigger value="today">今天</TabsTrigger>
        <TabsTrigger value="week">本周</TabsTrigger>
        <TabsTrigger value="month">本月</TabsTrigger>
      </TabsList>
      <TabsContent value="today">今天完成 3 件，专注 2.5 小时。</TabsContent>
      <TabsContent value="week">本周完成 12 件，连续打卡 5 天。</TabsContent>
      <TabsContent value="month">本月趋势平稳向上。</TabsContent>
    </Tabs>
  ),
};

export const BreadcrumbStory: StoryObj = {
  name: 'Breadcrumb',
  render: () => (
    <Breadcrumb
      items={[{ label: '首页', href: '#' }, { label: '待办', href: '#' }, { label: '详情' }]}
    />
  ),
};
