/**
 * Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
 * scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
 *
 * The dust behind the hero and the footer, after the background of venizia.ai: a field of small squares in
 * the product's colour, in three sizes, denser in one soft cloud and sparse elsewhere. At rest each square
 * sways slowly on a wide wave. A mouse or pen moving over the page pushes them: the pointer stirs a grid of
 * velocities within a radius, the stir spreads and fades, and each square, a spring of its own mass, follows
 * the stir and settles back with a little overshoot. A press sends a ring outward.
 *
 * What it promises: the canvas ignores the pointer (the listeners are on the window, passive), so buttons
 * and links under it work as before; touch never stirs it; with reduced motion one still frame is drawn and
 * nothing moves; it stops when its canvas is off screen or the tab is hidden; there is no library. The page
 * is complete without it, on a plain background: the canvas is invisible (CSS) until the first frame is drawn,
 * which happens in the mounting hook itself, and the CSS then fades it in (`data-ready`).
 * The colour is the canvas's CSS `color` (the product's accent), read again when the theme changes.
 */
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export type TDustOptions = {
  /** The cloud where the dust is dense, in fractions of the canvas: centre and the two radii. */
  cloud: { x: number; y: number; rx: number; ry: number };
  /** The footer is always dark: it uses the dark strengths in either theme. */
  dark?: boolean;
};

/** Size of a square, in px, for the far, middle and near layers; and their strength, light and dark. */
const SIZES = [1.4, 2.4, 3.6];
/* the strongest layer is capped so that body text keeps 4.5:1 even straight under a square of it */
const ALPHA = { light: [0.16, 0.26, 0.42], dark: [0.15, 0.24, 0.34] };
/** The share of squares in each layer: far, middle, near. */
const SHARE = [0.625, 0.275, 0.1];

const CELL = 6; // squares are tried on a 6 px grid
const BASE = 0.012; // chance per cell far from the cloud
const PEAK = 0.085; // extra chance per cell in the cloud's heart

const SWAY = { length: 420, amount: 6, wobble: 2.5, speed: [0.8, 0.62] };
const STIR = {
  cell: 22, // px of one cell of the velocity grid
  radius: 190, // px the pointer stirs around itself
  push: 2400, // outward push, px/s per second of presence
  swirl: 0.34, // how much of the push turns sideways
  carry: 3, // how much of the pointer's own velocity the stir takes
  top: 1500, // px/s: the fastest pointer velocity that counts
  press: 900, // the ring a press sends out
  fade: 0.28, // s: how long a stir lasts
  spread: 5.5, // how fast a stir blurs into its neighbours
  followPointer: 0.055, // s: smoothing of the pointer position
  followSpeed: 0.08, // s: smoothing of the pointer velocity
};
const SPRING = { stiffness: 120, damping: 0.62, pull: 13, limit: 95 };

/** A repeatable number in [0, 1) for a pair of integers. */
const hash = (x: number, y: number): number => {
  let n = (x * 374761393 + y * 668265263) | 0;

  n = Math.imul(n ^ (n >>> 13), 1274126177);

  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

export const useDust = (canvas: Ref<HTMLCanvasElement | null>, options: TDustOptions): void => {
  // read after mount: on the server there is no window, and a component that touches one while it renders breaks the build
  let calm: MediaQueryList | null = null;

  const isCalm = (): boolean => calm?.matches ?? false;

  let frame = 0;
  let observer: IntersectionObserver | null = null;
  let resizer: ResizeObserver | null = null;
  let themes: MutationObserver | null = null;
  let visible = false;
  let width = 0;
  let height = 0;
  let color = '#888888';
  let alphas = ALPHA.light;

  // the squares: rest position, layer, mass, displacement and velocity
  let count = 0;
  let rx = new Float32Array(0);
  let ry = new Float32Array(0);
  let layer = new Uint8Array(0);
  let phase = new Float32Array(0);
  let inverseMass = new Float32Array(0);
  let dx = new Float32Array(0);
  let dy = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);

  // the grid of stir velocities, and its scratch copy
  let cols = 0;
  let rows = 0;
  let fieldX = new Float32Array(0);
  let fieldY = new Float32Array(0);
  let nextX = new Float32Array(0);
  let nextY = new Float32Array(0);

  // the pointer, as it is and as it is followed
  let pointerX: number | null = null;
  let pointerY: number | null = null;
  let followX = 0;
  let followY = 0;
  let hasFollow = false;
  let speedX = 0;
  let speedY = 0;
  let pressX: number | null = null;
  let pressY: number | null = null;
  let last = 0;

  const readColor = (): void => {
    const element = canvas.value;

    if (!element) {
      return;
    }

    color = getComputedStyle(element).color;
    alphas =
      options.dark || document.documentElement.classList.contains('dark')
        ? ALPHA.dark
        : ALPHA.light;
  };

  /** Places the squares: a hash tried on every cell, kept with a chance that is high in the cloud. */
  const plant = (): void => {
    const xs: number[] = [];
    const ys: number[] = [];
    const layers: number[] = [];
    const { cloud } = options;

    for (let cy = 0; cy < Math.floor(height / CELL); cy += 1) {
      for (let cx = 0; cx < Math.floor(width / CELL); cx += 1) {
        const x = cx * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        const ux = (x / width - cloud.x) / cloud.rx;
        const uy = (y / height - cloud.y) / cloud.ry;
        const chance = BASE + PEAK * Math.exp(-(ux * ux + uy * uy) * 1.6);
        const pick = hash(cx, cy) / chance;

        if (pick >= 1) {
          continue;
        }

        xs.push(x);
        ys.push(y);
        layers.push(pick < SHARE[0] ? 0 : pick < SHARE[0] + SHARE[1] ? 1 : 2);
      }
    }

    count = xs.length;
    rx = Float32Array.from(xs);
    ry = Float32Array.from(ys);
    layer = Uint8Array.from(layers);
    phase = new Float32Array(count);
    inverseMass = new Float32Array(count);
    dx = new Float32Array(count);
    dy = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      phase[i] = (rx[i] * 0.37 + ry[i] * 0.21) % (Math.PI * 2);
      inverseMass[i] = 1 / (0.72 + hash(i, 7) * 0.78);
    }

    cols = Math.ceil(width / STIR.cell) + 2;
    rows = Math.ceil(height / STIR.cell) + 2;
    fieldX = new Float32Array(cols * rows);
    fieldY = new Float32Array(cols * rows);
    nextX = new Float32Array(cols * rows);
    nextY = new Float32Array(cols * rows);
  };

  /** The stir around a point: a push outward, a turn sideways and the pointer's own velocity. */
  const stir = (x: number, y: number, push: number, carryX: number, carryY: number): void => {
    const { radius, cell, swirl } = STIR;
    const from = Math.max(0, Math.floor((x - radius) / cell));
    const to = Math.min(cols - 1, Math.ceil((x + radius) / cell));
    const above = Math.max(0, Math.floor((y - radius) / cell));
    const below = Math.min(rows - 1, Math.ceil((y + radius) / cell));

    for (let row = above; row <= below; row += 1) {
      for (let col = from; col <= to; col += 1) {
        const offsetX = col * cell - x;
        const offsetY = row * cell - y;
        const distance = Math.hypot(offsetX, offsetY);

        if (distance > radius) {
          continue;
        }

        const weight = smooth(1 - distance / radius);
        const unitX = distance > 0.001 ? offsetX / distance : 0;
        const unitY = distance > 0.001 ? offsetY / distance : 0;
        const at = row * cols + col;

        fieldX[at] += unitX * push * weight - unitY * push * swirl * weight + carryX * weight;
        fieldY[at] += unitY * push * weight + unitX * push * swirl * weight + carryY * weight;
      }
    }
  };

  /** The stir blurs into its neighbours and fades. */
  const settle = (seconds: number): void => {
    const keep = Math.exp(-seconds / STIR.fade);
    const mix = Math.min(0.5, STIR.spread * seconds);

    for (let row = 0; row < rows; row += 1) {
      const here = row * cols;
      const up = row > 0 ? here - cols : here;
      const down = row < rows - 1 ? here + cols : here;

      for (let col = 0; col < cols; col += 1) {
        const at = here + col;
        const left = col > 0 ? at - 1 : at;
        const right = col < cols - 1 ? at + 1 : at;
        const meanX = (fieldX[left] + fieldX[right] + fieldX[up + col] + fieldX[down + col]) * 0.25;
        const meanY = (fieldY[left] + fieldY[right] + fieldY[up + col] + fieldY[down + col]) * 0.25;

        nextX[at] = (fieldX[at] + (meanX - fieldX[at]) * mix) * keep;
        nextY[at] = (fieldY[at] + (meanY - fieldY[at]) * mix) * keep;
      }
    }

    [fieldX, nextX] = [nextX, fieldX];
    [fieldY, nextY] = [nextY, fieldY];
  };

  /** The pointer is followed, not jumped to, and its velocity with it: the stir starts and stops softly. */
  const follow = (seconds: number): void => {
    if (pointerX === null || pointerY === null) {
      hasFollow = false;
      speedX = 0;
      speedY = 0;

      return;
    }

    if (!hasFollow || seconds <= 0) {
      followX = pointerX;
      followY = pointerY;
      hasFollow = true;
      speedX = 0;
      speedY = 0;

      return;
    }

    const toward = 1 - Math.exp(-seconds / STIR.followPointer);
    const nextXAt = followX + (pointerX - followX) * toward;
    const nextYAt = followY + (pointerY - followY) * toward;
    const blend = 1 - Math.exp(-seconds / STIR.followSpeed);

    speedX += ((nextXAt - followX) / seconds - speedX) * blend;
    speedY += ((nextYAt - followY) / seconds - speedY) * blend;
    followX = nextXAt;
    followY = nextYAt;
  };

  const paint = (time: number, seconds: number, moving: boolean): void => {
    const element = canvas.value;
    const context = element?.getContext('2d');

    if (!element || !context) {
      return;
    }

    const box = element.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);

    if (moving) {
      follow(seconds);

      if (hasFollow) {
        const x = followX - box.left;
        const y = followY - box.top;

        if (
          x > -STIR.radius &&
          y > -STIR.radius &&
          x < width + STIR.radius &&
          y < height + STIR.radius
        ) {
          const fast = Math.hypot(speedX, speedY);
          const cap = fast > STIR.top ? STIR.top / fast : 1;

          stir(
            x,
            y,
            STIR.push * seconds,
            speedX * cap * STIR.carry * seconds,
            speedY * cap * STIR.carry * seconds,
          );
        }
      }

      if (pressX !== null && pressY !== null) {
        stir(pressX - box.left, pressY - box.top, STIR.press, 0, 0);
        pressX = null;
        pressY = null;
      }

      settle(seconds);
    }

    // a square is a spring on its own mass, pulled by the stir under it; a few small steps when a frame is long
    const steps = moving && seconds > 0 ? Math.min(3, Math.ceil(seconds / (1 / 90))) : 0;
    const step = steps > 0 ? seconds / steps : 0;
    const damping = 2 * SPRING.damping * Math.sqrt(SPRING.stiffness);
    const waves = (Math.PI * 2) / SWAY.length;

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);

    const paths = [new Path2D(), new Path2D(), new Path2D()];

    for (let i = 0; i < count; i += 1) {
      let swayX = 0;
      let swayY = 0;

      if (moving) {
        const a = Math.sin(rx[i] * waves + time * SWAY.speed[0]);
        const b = Math.cos(ry[i] * waves + time * SWAY.speed[1]);

        swayX = (a + b) * SWAY.amount + Math.sin(time * 0.7 + phase[i]) * SWAY.wobble;
        swayY = (b - a) * SWAY.amount + Math.cos(time * 0.55 + phase[i] * 1.7) * SWAY.wobble;

        const col = Math.min(cols - 1, Math.max(0, Math.round(rx[i] / STIR.cell)));
        const row = Math.min(rows - 1, Math.max(0, Math.round(ry[i] / STIR.cell)));
        const under = row * cols + col;
        const pushX = fieldX[under];
        const pushY = fieldY[under];

        if (
          Math.abs(pushX) > 1.5 ||
          Math.abs(pushY) > 1.5 ||
          Math.abs(dx[i]) > 0.05 ||
          Math.abs(dy[i]) > 0.05 ||
          Math.abs(vx[i]) > 0.05 ||
          Math.abs(vy[i]) > 0.05
        ) {
          for (let s = 0; s < steps; s += 1) {
            vx[i] +=
              ((pushX - vx[i]) * SPRING.pull - SPRING.stiffness * dx[i] - damping * vx[i]) *
              inverseMass[i] *
              step;
            vy[i] +=
              ((pushY - vy[i]) * SPRING.pull - SPRING.stiffness * dy[i] - damping * vy[i]) *
              inverseMass[i] *
              step;
            dx[i] += vx[i] * step;
            dy[i] += vy[i] * step;
          }

          const reach = dx[i] * dx[i] + dy[i] * dy[i];

          if (reach > SPRING.limit * SPRING.limit) {
            const back = SPRING.limit / Math.sqrt(reach);

            dx[i] *= back;
            dy[i] *= back;
            vx[i] *= back;
            vy[i] *= back;
          }
        } else if (dx[i] || dy[i] || vx[i] || vy[i]) {
          dx[i] = 0;
          dy[i] = 0;
          vx[i] = 0;
          vy[i] = 0;
        }
      }

      const size = SIZES[layer[i]];

      paths[layer[i]].rect(
        rx[i] + swayX + dx[i] - size / 2,
        ry[i] + swayY + dy[i] - size / 2,
        size,
        size,
      );
    }

    context.fillStyle = color;

    for (let n = 0; n < 3; n += 1) {
      context.globalAlpha = alphas[n];
      context.fill(paths[n]);
    }

    context.globalAlpha = 1;
  };

  const loop = (now: number): void => {
    const seconds = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);

    last = now;
    paint(now / 1000, seconds, true);
    frame = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };

  const run = (): void => {
    if (frame === 0 && !isCalm()) {
      last = 0;
      frame = requestAnimationFrame(loop);
    }
  };

  const fit = (): void => {
    const element = canvas.value;
    const box = element?.parentElement?.getBoundingClientRect();

    if (!element || !box) {
      return;
    }

    const scale = Math.min(window.devicePixelRatio || 1, 2);

    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    element.width = Math.round(width * scale);
    element.height = Math.round(height * scale);
    readColor();
    plant();
    paint(0, 0, false);
  };

  // a mouse or a pen stirs the dust; a finger never does, so a swipe that scrolls the page leaves it alone
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || isCalm()) {
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  const onPress = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || isCalm()) {
      return;
    }

    onMove(event);
    pressX = event.clientX;
    pressY = event.clientY;
  };
  const onLeave = (): void => {
    pointerX = null;
    pointerY = null;
  };
  const onVisibility = (): void => {
    if (!document.hidden && visible) {
      run();
    }
  };
  const onMotion = (): void => {
    if (isCalm()) {
      cancelAnimationFrame(frame);
      frame = 0;
      onLeave();
      paint(0, 0, false);
    } else if (visible) {
      run();
    }
  };

  onMounted(() => {
    const element = canvas.value;

    if (!element?.parentElement) {
      return;
    }

    calm = matchMedia('(prefers-reduced-motion: reduce)');
    fit();
    element.dataset.ready = '';
    resizer = new ResizeObserver(fit);
    resizer.observe(element.parentElement);
    themes = new MutationObserver(() => {
      readColor();

      if (isCalm()) {
        paint(0, 0, false);
      }
    });
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);

      if (visible) {
        run();
      }
    });
    observer.observe(element);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onPress, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    calm.addEventListener('change', onMotion);
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    resizer?.disconnect();
    themes?.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onPress);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    calm?.removeEventListener('change', onMotion);
  });
};
