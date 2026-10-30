import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './tag';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = {
  title: 'Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-96">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>本周回顾</CardTitle>
            <CardDescription>连续打卡 5 天，完成 12 件待办。</CardDescription>
          </div>
          <Badge variant="ok">健康</Badge>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-muted">
            卡片是最常用的内容容器：柔和阴影、12px 圆角。
          </p>
        </CardContent>
        <CardFooter>
          <Button size="sm">查看详情</Button>
          <Button size="sm" variant="ghost">
            稍后再看
          </Button>
        </CardFooter>
      </Card>
    </div>
  ),
};
