import type { TBindingKey } from '@/common/types';

// No index signature: it would let a misspelled read (`metadata.optional`) compile as `any`.
export interface IPropertyMetadata {
  bindingKey: TBindingKey;
  isOptional?: boolean;
}

export interface IInjectMetadata {
  key: TBindingKey;
  index: number;
  isOptional?: boolean;
}
