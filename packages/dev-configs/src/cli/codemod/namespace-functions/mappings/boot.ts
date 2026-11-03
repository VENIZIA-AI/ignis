import type { INamespaceMapping } from '../mapping';

/** `.` and `./generator` both export the generator (`src/index.ts` re-exports `./generator`); no other package re-exports it. */
const BOOT_AND_GENERATOR = ['@venizia/ignis-boot', '@venizia/ignis-boot/generator'];

/**
 * The functions of `@venizia/ignis-boot` that moved into a class. Both already took one options
 * object, so each entry only moves the callee (`keepsOptions`).
 */
export const BOOT_MAPPINGS: ReadonlyArray<INamespaceMapping> = [
  {
    modules: BOOT_AND_GENERATOR,
    oldName: 'generateArtifactIndex',
    className: 'ArtifactIndexGenerator',
    method: 'generate',
    params: [],
    keepsOptions: true,
  },
  {
    modules: BOOT_AND_GENERATOR,
    oldName: 'checkArtifactIndex',
    className: 'ArtifactIndexGenerator',
    method: 'check',
    params: [],
    keepsOptions: true,
  },
];
