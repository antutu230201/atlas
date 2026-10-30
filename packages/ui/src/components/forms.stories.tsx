import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox';
import { Radio, RadioGroup } from './radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Switch } from './switch';

const meta = {
  title: 'Forms',
} satisfies Meta;

export default meta;

export const SwitchStory: StoryObj = {
  name: 'Switch',
  render: () => (
    <div className="flex items-center gap-6">
      <Switch defaultChecked aria-label="开启通知" />
      <Switch aria-label="关闭通知" />
      <Switch disabled aria-label="禁用开关" />
    </div>
  ),
};

export const CheckboxStory: StoryObj = {
  name: 'Checkbox',
  render: () => (
    <div className="flex flex-col gap-3">
      <Checkbox id="st-cb1" label="同意条款" defaultChecked />
      <Checkbox id="st-cb2" label="订阅周报" />
      <Checkbox id="st-cb3" label="不可用" disabled />
    </div>
  ),
};

export const RadioStory: StoryObj = {
  name: 'RadioGroup',
  render: () => (
    <RadioGroup defaultValue="weekly" className="flex gap-4" aria-label="复盘频率">
      <Radio id="st-r1" value="daily" label="每天" />
      <Radio id="st-r2" value="weekly" label="每周" />
      <Radio id="st-r3" value="monthly" label="每月" />
    </RadioGroup>
  ),
};

export const SelectStory: StoryObj = {
  name: 'Select',
  render: () => (
    <Select>
      <SelectTrigger aria-label="优先级">
        <SelectValue placeholder="选择优先级" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="high">高</SelectItem>
        <SelectItem value="medium">中</SelectItem>
        <SelectItem value="low">低</SelectItem>
      </SelectContent>
    </Select>
  ),
};
