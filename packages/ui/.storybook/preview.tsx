import type { Preview } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../src';
import './preview.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    docs: { autodocs: 'tag' },
    options: {
      storySort: { order: ['Button', 'Input', 'Forms', 'Data', 'Overlay', 'Feedback', 'Theme'] },
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="min-h-24 bg-bg p-6 font-sans text-text">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;

export type Decorator = (Story: () => ReactNode) => ReactNode;
