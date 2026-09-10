import type { AnyType, TBindingKey, TClass } from '@/common/types';

// No index signature: it would let a misspelled read (`metadata.optional`) compile as `any`.
export interface IPropertyMetadata {
  bindingKey?: TBindingKey;
  /** Named by class; the key is read off the class at resolve time. */
  target?: TClass<AnyType>;
  isOptional?: boolean;
}

export interface IInjectMetadata {
  key?: TBindingKey;
  /** Named by class; the key is read off the class at resolve time. */
  target?: TClass<AnyType>;
  index: number;
  isOptional?: boolean;
}

/** What `MetadataKeys.BINDING_KEY` holds. */
export interface IBindingKeyRecord {
  key: TBindingKey;
  isProvisional: boolean;
}
