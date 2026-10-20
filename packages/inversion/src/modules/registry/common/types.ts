import type { TBindingKey, TInjectTarget } from '@/common/types';

// No index signature: it would let a misspelled read (`metadata.optional`) compile as `any`.
export interface IPropertyMetadata {
  bindingKey?: TBindingKey;
  /** Named by class, or by a function returning it; the key is read off the class at resolve time. */
  target?: TInjectTarget;
  isOptional?: boolean;
}

export interface IInjectMetadata {
  key?: TBindingKey;
  /** Named by class, or by a function returning it; the key is read off the class at resolve time. */
  target?: TInjectTarget;
  index: number;
  isOptional?: boolean;
}

/** What `MetadataKeys.BINDING_KEY` holds. */
export interface IBindingKeyRecord {
  key: TBindingKey;
  isProvisional: boolean;
}
