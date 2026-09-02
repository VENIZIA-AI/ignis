import type { TConstValue, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** The step names the kernel defines - the vocabulary a subclass targets with `BootSequence.insertAfter`. A server application adds its own on top (`ServerBootSteps` in `@venizia/ignis`). */
export class BootSteps {
  static readonly STATIC_CONFIGURE = 'staticConfigure';
  static readonly REGISTER_ARTIFACTS = 'registerArtifacts';
  static readonly PRE_CONFIGURE = 'preConfigure';
  static readonly REGISTER_DEFAULT_MIDDLEWARES = 'registerDefaultMiddlewares';
  static readonly REGISTER_DATA_SOURCES = 'registerDataSources';
  static readonly REGISTER_COMPONENTS = 'registerComponents';
  static readonly REGISTER_CONTRIBUTED_DATA_SOURCES = 'registerContributedDataSources';
  static readonly REGISTER_CONTROLLERS = 'registerControllers';
  static readonly POST_CONFIGURE = 'postConfigure';

  static readonly SCHEME_SET = new Set<string>([
    this.STATIC_CONFIGURE,
    this.REGISTER_ARTIFACTS,
    this.PRE_CONFIGURE,
    this.REGISTER_DEFAULT_MIDDLEWARES,
    this.REGISTER_DATA_SOURCES,
    this.REGISTER_COMPONENTS,
    this.REGISTER_CONTRIBUTED_DATA_SOURCES,
    this.REGISTER_CONTROLLERS,
    this.POST_CONFIGURE,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TBootStep = TConstValue<typeof BootSteps>;

export interface IBootSequenceStep {
  name: string;
  run: () => ValueOrPromise<void>;
}

/** Composes a boot sequence by name instead of copying the array - a subclass reads exactly what it adds by reading its own override, without diffing two files by eye. */
export class BootSequence {
  /** A duplicated name is refused as loudly as a missing one - picking the first match would splice a step into the wrong place silently. */
  private static indexOf(opts: { steps: IBootSequenceStep[]; target: string }): number {
    const { steps, target } = opts;
    const matches = steps.flatMap((step, index) => (step.name === target ? [index] : []));
    const known = steps.map(step => step.name).join(', ');

    switch (matches.length) {
      case 0: {
        throw getError({
          message: `[BootSequence] Unknown step: '${target}' | Known steps: ${known}`,
        });
      }
      case 1: {
        return matches[0];
      }
      default: {
        throw getError({
          message: `[BootSequence] Ambiguous step: '${target}' appears ${matches.length} times | Known steps: ${known}`,
        });
      }
    }
  }

  static insertAfter(opts: {
    steps: IBootSequenceStep[];
    target: string;
    step: IBootSequenceStep;
  }): IBootSequenceStep[] {
    const { steps, target, step } = opts;
    const index = BootSequence.indexOf({ steps, target });

    return [...steps.slice(0, index + 1), step, ...steps.slice(index + 1)];
  }
}
