import type { Container } from '@/helpers/inversion';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IProvider } from '@venizia/ignis-inversion';

/** Base class for a provider: `value(container)` computes the value the provider supplies, using the container to resolve its dependencies. */
export abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
  abstract value(container: Container): T;
}
