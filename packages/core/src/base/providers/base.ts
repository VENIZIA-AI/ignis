import { BaseHelper, Container, IProvider } from '@vez/ignis-helpers';

export abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
  abstract value(container: Container): T;
}
