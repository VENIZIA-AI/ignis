/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The light and dark switch. The default theme lets a Layout override the `toggle-appearance`
 * injection; this is that override. The whole page cross-fades from one theme to the other in 200ms:
 * with View Transitions, the browser's default root cross-fade (its length is set in theme-switch.css);
 * without them, a fade of the colours (theme-fade, also theme-switch.css); with reduced motion the
 * switch is instant. Nothing moves across the screen. Call it from the setup of the Layout component.
 */
import { useData } from 'vitepress';
import { nextTick, provide } from 'vue';

const FADE_MS = 200;

export const provideThemeSwitch = (): void => {
  const { isDark } = useData();
  const flip = (): void => {
    isDark.value = !isDark.value;
  };

  provide('toggle-appearance', (): void => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flip();

      return;
    }

    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(async () => {
        flip();
        await nextTick();
      });

      return;
    }

    const root = document.documentElement;

    root.classList.add('theme-fade');
    flip();
    setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 60);
  });
};
