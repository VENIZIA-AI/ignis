import type { Container } from '@/helpers/inversion';
import { BaseHelper } from '@venizia/ignis-helpers/core';
import type { IProvider } from '@venizia/ignis-inversion';

export abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
  abstract value(container: Container): T;
}
