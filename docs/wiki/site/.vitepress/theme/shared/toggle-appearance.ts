/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The light and dark switch. The default theme lets a Layout override the `toggle-appearance`
 * injection; this is that override. With View Transitions the whole page is one image revealed by a
 * circle that grows from the toggle; without them a short cross-fade of the colours (theme-switch.css);
 * with reduced motion the switch is instant. Call it from the setup of the Layout component.
 */
import { useData } from 'vitepress';
import { nextTick, provide } from 'vue';

const REVEAL_MS = 450;
const FADE_MS = 200;

export const provideThemeSwitch = (): void => {
  const { isDark } = useData();
  const flip = (): void => {
    isDark.value = !isDark.value;
  };

  provide('toggle-appearance', async (event: MouseEvent): Promise<void> => {
    const root = document.documentElement;

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flip();

      return;
    }

    if (typeof document.startViewTransition === 'function') {
      // A keyboard click has no pointer position: the circle grows from the middle of the button.
      const box = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
      const x = event.clientX || (box ? box.left + box.width / 2 : innerWidth / 2);
      const y = event.clientY || (box ? box.top + box.height / 2 : 0);
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = document.startViewTransition(async () => {
        flip();
        await nextTick();
      });

      try {
        await transition.ready;
      } catch {
        // The transition was skipped (the tab is hidden): the theme has changed all the same.
        return;
      }

      root.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
        },
        {
          duration: REVEAL_MS,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        },
      );

      return;
    }

    root.classList.add('theme-fade');
    flip();
    setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 60);
  });
};
