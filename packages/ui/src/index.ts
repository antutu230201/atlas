/**
 * @atlas/ui —— Atlas 组件库
 * 规则：所有视觉值来自 @atlas/tokens 的语义令牌；本包不出现写死的颜色/圆角/阴影。
 */

export { cn } from './cn';

/* 动效系统：hooks + 包装组件（tokens.css 提供 .atlas-m-* 工具类与 keyframes） */
export {
  usePrefersReducedMotion,
  useScrollReveal,
  useSpotlight,
  useTilt,
  useMagnetic,
  useParallax,
  useCountUp,
  useTypewriter,
  useScrollStory,
} from './motion/hooks';
export {
  Reveal,
  SpotlightCard,
  TextDecode,
  TiltCard,
  MagneticButton,
  CountUp,
  Typewriter,
  Marquee,
  ScrollStory,
} from './motion/components';
export {
  CheckIcon,
  XIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from './icons';

export * from './components/breadcrumb';
export * from './components/button';
export * from './components/card';
export * from './components/checkbox';
export * from './components/dialog';
export * from './components/drawer';
export * from './components/dropdown-menu';
export * from './components/empty-state';
export * from './components/input';
export * from './components/pagination';
export * from './components/radio-group';
export * from './components/select';
export * from './components/skeleton';
export * from './components/spinner';
export * from './components/switch';
export * from './components/table';
export * from './components/tabs';
export * from './components/tag';
export * from './components/theme';
export * from './components/toast';
export * from './components/tooltip';
