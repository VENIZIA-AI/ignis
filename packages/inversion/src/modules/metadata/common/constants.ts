/** Symbol keys under which the decorators store reflect metadata: properties, injects and the binding key. */
export const MetadataKeys = {
  PROPERTIES: Symbol.for('ignis:properties'),
  INJECT: Symbol.for('ignis:inject'),
  BINDING_KEY: Symbol.for('ignis:binding-key'),
};
