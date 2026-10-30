import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, IconButton } from './button';
import { Spinner } from './spinner';
import { XIcon } from '../icons';

const meta = {
  title: 'Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: '主按钮' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: '次级按钮' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: '幽灵按钮' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: '危险操作' },
};

export const Loading: Story = {
  args: { loading: true, children: '提交中' },
};

export const Disabled: Story = {
  args: { disabled: true, children: '禁用' },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">小</Button>
      <Button size="md">中</Button>
      <Button size="lg">大</Button>
    </div>
  ),
};

export const IconButtons: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton aria-label="关闭" variant="ghost">
        <XIcon />
      </IconButton>
      <IconButton aria-label="关闭" disabled>
        <XIcon />
      </IconButton>
    </div>
  ),
};

export const SpinnerStory: Story = {
  name: 'Spinner',
  render: () => (
    <div className="flex items-center gap-3">
      <Spinner />
      <span className="text-sm text-primary">
        <Spinner className="mr-2 inline" />
        加载中…
      </span>
    </div>
  ),
};
