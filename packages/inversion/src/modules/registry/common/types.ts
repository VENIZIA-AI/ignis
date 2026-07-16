import type { TBindingKey } from '@/common/types';
import type { TBindingScope } from '../../binding/common/constants';

export interface IPropertyMetadata {
  bindingKey: TBindingKey;
  isOptional?: boolean;
  [key: string]: any;
}

export interface IInjectMetadata {
  key: TBindingKey;
  index: number;
  isOptional?: boolean;
}

export interface IInjectableMetadata {
  scope?: TBindingScope;
  tags?: Record<string, any>;
}
