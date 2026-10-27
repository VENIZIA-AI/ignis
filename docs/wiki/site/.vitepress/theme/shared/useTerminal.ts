/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The terminal of the home window: each command is typed, each group of output fades in, a fresh
 * prompt waits at the end. TerminalView renders every line into the HTML, so the height is final from
 * the first paint and a page without script shows the finished terminal; this only plays it.
 * With reduced motion the finished state is shown at once.
 */
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

const runs = new WeakMap<Element, object>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (min: number, max: number): number => min + Math.random() * (max - min);
const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const part = (row: Element, selector: string): HTMLElement =>
  row.querySelector(selector) as HTMLElement;

const finish = (term: HTMLElement): void => {
  term.querySelectorAll<HTMLElement>('.term-cmd:not(.term-next)').forEach((row) => {
    row.classList.add('is-on');
    row.classList.remove('is-active');
    part(row, '.typed-done').textContent = row.dataset.text ?? '';
    part(row, '.typed-rest').textContent = '';
  });
  term.querySelectorAll('.term-group').forEach((group) => group.classList.add('is-in'));
  term.querySelector('.term-next')?.classList.add('is-on', 'is-active', 'is-idle');
  term.classList.add('is-done');
};

const reset = (term: HTMLElement): void => {
  term.classList.remove('is-done');
  term.querySelectorAll<HTMLElement>('.term-cmd').forEach((row) => {
    row.classList.remove('is-on', 'is-active', 'is-idle');

    if (row.dataset.text !== undefined) {
      part(row, '.typed-done').textContent = '';
      part(row, '.typed-rest').textContent = row.dataset.text;
    }
  });
  term.querySelectorAll('.term-group').forEach((group) => group.classList.remove('is-in'));
};

export const playTerminal = async (term: HTMLElement): Promise<void> => {
  const token = {};

  runs.set(term, token);

  if (calm()) {
    finish(term);

    return;
  }

  reset(term);

  const alive = (): boolean => runs.get(term) === token;
  const steps = [...term.children] as HTMLElement[];

  await sleep(450);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (!alive()) {
      return;
    }

    if (step.classList.contains('term-cmd')) {
      step.classList.add('is-on', 'is-active');

      if (step.dataset.text === undefined) {
        step.classList.add('is-idle');

        continue;
      }

      const text = step.dataset.text;
      const pace = Math.min(jitter(25, 45), 2300 / text.length);

      await sleep(280);

      for (let n = 1; n <= text.length; n++) {
        if (!alive()) {
          return;
        }

        part(step, '.typed-done').textContent = text.slice(0, n);
        part(step, '.typed-rest').textContent = text.slice(n);
        await sleep(pace * jitter(0.6, 1.5));
      }

      step.classList.remove('is-active');

      // The command runs: a pause only when output follows.
      await sleep(steps[i + 1]?.classList.contains('term-group') ? jitter(300, 400) : 160);
    } else if (step.classList.contains('term-group')) {
      step.classList.add('is-in');
      await sleep(jitter(200, 280));
    }
  }

  term.classList.add('is-done');
};

/** Plays a scene and reports it when it stops; the page does not depend on it, so it is never thrown at the caller. */
const start = (term: HTMLElement): void => {
  playTerminal(term).catch((error: unknown) => {
    console.error('terminal: a scene stopped', error);
  });
};

export const playTerminalsIn = (container: Element): void => {
  container.querySelectorAll<HTMLElement>('[data-term]').forEach(start);
};

/** Plays each terminal under the root once, when it first scrolls into view. */
export const useTerminal = (root: Ref<HTMLElement | null>): void => {
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !runs.has(entry.target)) {
            start(entry.target as HTMLElement);
          }
        }
      },
      { threshold: 0.45 },
    );

    root.value?.querySelectorAll('[data-term]').forEach((term) => observer?.observe(term));
  });

  onBeforeUnmount(() => observer?.disconnect());
};
