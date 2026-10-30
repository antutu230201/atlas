import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Input, Textarea } from './input';

const meta = {
  title: 'Input',
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-80">
      <Field id="s-title" label="标题" hint="最多 50 字" required>
        <Input id="s-title" placeholder="记录今天的一件小事…" />
      </Field>
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className="w-80">
      <Field id="s-title-err" label="标题" error="内容不能为空">
        <Input id="s-title-err" invalid />
      </Field>
    </div>
  ),
};

export const DisabledInput: Story = {
  render: () => (
    <div className="w-80">
      <Field id="s-title-disabled" label="标题">
        <Input id="s-title-disabled" disabled placeholder="不可编辑" />
      </Field>
    </div>
  ),
};

export const TextareaStory: Story = {
  name: 'Textarea',
  render: () => (
    <div className="w-80">
      <Field id="s-body" label="正文">
        <Textarea id="s-body" placeholder="写点什么…" />
      </Field>
    </div>
  ),
};
