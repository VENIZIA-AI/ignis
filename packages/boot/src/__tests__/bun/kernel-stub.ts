// Test-only: decorators that do nothing, served as '@venizia/ignis-kernel' (boot does not depend on the kernel).
import { plugin } from 'bun';

const passThrough = () => (target: unknown) => target;

plugin({
  name: 'kernel-stub',
  setup(build) {
    build.module('@venizia/ignis-kernel', () => ({
      exports: { service: passThrough, repository: passThrough },
      loader: 'object',
    }));
  },
});
