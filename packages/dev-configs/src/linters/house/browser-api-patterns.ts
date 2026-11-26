/** How a hand-written browser API shows up in code. */
export type TBrowserApiMatch =
  /** A property of the global object read or called: `window.matchMedia(...)`, `matchMedia(...)`. */
  | { type: 'global'; names: ReadonlyArray<string> }
  /** A member path under a global: `navigator.onLine`, `navigator.clipboard.writeText`. */
  | { type: 'path'; paths: ReadonlyArray<string> }
  /** `new X(...)` of a global class. */
  | { type: 'new'; callees: ReadonlyArray<string> }
  /** `<object>.addEventListener('<event>', ...)`; `objects` names the objects it counts for (the globals `window`, `document`, `self` and `globalThis` when absent). */
  | { type: 'listener'; events: ReadonlyArray<string>; objects?: ReadonlyArray<string> };

/** One browser API the framework already wraps, and what to use instead. */
export interface IBrowserApiPattern {
  /** The name `ignore` takes to switch the pattern off. */
  id: string;
  match: TBrowserApiMatch;
  /** What to use: the hooks, named as the message prints them. */
  hooks: string;
  /** The hand-written form, as the message prints it. */
  written: string;
}

/**
 * The browser APIs ARDOR (`@venizia/ardor-react`) wraps in a hook, one row each. `venizia/prefer-framework-api` reads this
 * table, so adding a pattern is adding a row here. Only forms a rule can tell apart reliably are rows: a hand-rolled
 * debounce or a draft-saving timer is not.
 */
export class BrowserApiPatterns {
  static readonly PACKAGE = '@venizia/ardor-react';

  static readonly TABLE: ReadonlyArray<IBrowserApiPattern> = [
    {
      id: 'match-media',
      match: { type: 'global', names: ['matchMedia'] },
      hooks: '`useMediaQuery` (a media query) or `useBreakpoint` (a screen size)',
      written: '`window.matchMedia`',
    },
    {
      id: 'window-size',
      match: { type: 'global', names: ['innerWidth', 'innerHeight'] },
      hooks: '`useWindowDimensions`',
      written: '`window.innerWidth` / `window.innerHeight`',
    },
    {
      id: 'window-resize',
      match: { type: 'listener', events: ['resize'], objects: ['window', 'self', 'globalThis'] },
      hooks: '`useWindowDimensions`',
      written: "a window `addEventListener('resize', ...)`",
    },
    {
      id: 'resize-observer',
      match: { type: 'new', callees: ['ResizeObserver'] },
      hooks: '`useElementSize` (measure an element) or `useResizeEffect` (react to its resize)',
      written: '`new ResizeObserver(...)`',
    },
    {
      id: 'intersection-observer',
      match: { type: 'new', callees: ['IntersectionObserver'] },
      hooks: '`useIntersection`',
      written: '`new IntersectionObserver(...)`',
    },
    {
      id: 'online-status',
      match: { type: 'path', paths: ['navigator.onLine'] },
      hooks: '`useOnlineStatus`',
      written: '`navigator.onLine`',
    },
    {
      id: 'online-listener',
      match: { type: 'listener', events: ['online', 'offline'] },
      hooks: '`useOnlineStatus`',
      written: 'an `online` / `offline` `addEventListener`',
    },
    {
      id: 'document-visibility',
      match: { type: 'path', paths: ['document.visibilityState', 'document.hidden'] },
      hooks: '`useDocumentVisibility`',
      written: '`document.visibilityState`',
    },
    {
      id: 'visibility-listener',
      match: { type: 'listener', events: ['visibilitychange'] },
      hooks: '`useDocumentVisibility`',
      written: 'a `visibilitychange` `addEventListener`',
    },
    {
      id: 'before-unload',
      match: { type: 'listener', events: ['beforeunload'] },
      hooks: '`useBeforeUnload`',
      written: 'a `beforeunload` `addEventListener`',
    },
    {
      id: 'clipboard-write',
      match: { type: 'path', paths: ['navigator.clipboard.writeText'] },
      hooks: '`useCopyToClipboard`',
      written: '`navigator.clipboard.writeText`',
    },
    {
      id: 'confirm',
      match: { type: 'global', names: ['confirm'] },
      hooks: '`useConfirm`',
      written: '`window.confirm`',
    },
  ];
}
