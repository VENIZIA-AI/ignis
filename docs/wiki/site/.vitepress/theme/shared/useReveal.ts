/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * Reveal on scroll: every `.reveal` inside the root rises into place the first time it is in view.
 * With reduced motion, or without IntersectionObserver, it is shown at once. The hidden state is only
 * applied under the `js` class of <html> (home.css), so a page without script shows everything.
 */
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export const useReveal = (root: Ref<HTMLElement | null>): void => {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    const items = [...(root.value?.querySelectorAll('.reveal') ?? [])];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-in'));

      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer?.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    items.forEach((item) => observer?.observe(item));
  });

  onBeforeUnmount(() => observer?.disconnect());
};
