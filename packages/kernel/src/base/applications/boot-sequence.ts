import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

export interface IBootSequenceStep {
  name: string;
  run: () => ValueOrPromise<void>;
}

/** Composes a boot sequence by name instead of copying the array - a subclass reads exactly what it adds by reading its own override, without diffing two files by eye. */
export class BootSequence {
  private static indexOf(opts: { steps: IBootSequenceStep[]; target: string }): number {
    const { steps, target } = opts;
    const index = steps.findIndex(step => step.name === target);

    if (index === -1) {
      throw getError({
        message: `[BootSequence] Unknown step: '${target}' | Known steps: ${steps.map(step => step.name).join(', ')}`,
      });
    }

    return index;
  }

  static insertBefore(opts: {
    steps: IBootSequenceStep[];
    target: string;
    step: IBootSequenceStep;
  }): IBootSequenceStep[] {
    const { steps, target, step } = opts;
    const index = BootSequence.indexOf({ steps, target });

    return [...steps.slice(0, index), step, ...steps.slice(index)];
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
