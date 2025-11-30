import { IProvider } from '@/common';
import { BaseHelper } from '../helpers';
import { Container } from '@/helpers';

export abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
  abstract value(container: Container): T;
}
