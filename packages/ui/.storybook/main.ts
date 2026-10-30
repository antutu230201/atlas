import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  viteFinal: async (config) => {
    // Tailwind v4：令牌经 @theme 编译为工具类（与 apps/web 同源）
    const tailwind = (await import('@tailwindcss/vite')).default;
    config.plugins = [...(config.plugins ?? []), tailwind()];
    return config;
  },
};

export default config;
