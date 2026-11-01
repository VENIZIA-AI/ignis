/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * Tells the stylesheet whether the page has been scrolled: the class `bar-slim` on the root element, set once
 * the page is more than 24 px down and removed again only when it is back within 4 px of the top (so a
 * hairline of scroll does not make the bar flicker). topbar.css does the rest: the bar is 119 px high at the
 * top of a page and 64 px once it is slim, animated, and the page's own text does not move. Nothing runs
 * on the server; the class is set after mount.
 */
import { onBeforeUnmount, onMounted } from 'vue';

const SLIM_AFTER = 24;
const FULL_BEFORE = 4;

export const useBarState = (): void => {
  let frame = 0;
  let slim = false;

  const apply = (): void => {
    frame = 0;

    const next = slim ? window.scrollY > FULL_BEFORE : window.scrollY > SLIM_AFTER;

    if (next !== slim) {
      slim = next;
      document.documentElement.classList.toggle('bar-slim', slim);
    }
  };

  const onScroll = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(apply);
    }
  };

  onMounted(() => {
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    document.documentElement.classList.remove('bar-slim');
  });
};
