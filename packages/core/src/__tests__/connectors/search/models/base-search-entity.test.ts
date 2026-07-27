import { describe, test, expect } from 'bun:test';
import { z } from '@hono/zod-openapi';

import { BaseSearchEntity, defineSearchCollection, field } from '@/connectors/search/models';
import { SchemaTypes } from '@/base/models/common';

class ProductDocument extends BaseSearchEntity {
  static override schema = defineSearchCollection({
    name: 'products',
    fields: [
      field.string('title', { searchable: true }),
      field.number('price', { sortable: true }),
    ],
  });
}

describe('BaseSearchEntity', () => {
  test('name resolves from static definition.name', () => {
    const doc = new ProductDocument();
    expect(doc.name).toBe('products');
  });

  test('schema field returns the static collection definition', () => {
    const doc = new ProductDocument();
    expect(doc.schema).toBe(ProductDocument.schema);
  });

  test('getSchema SELECT derives from the DSL and parses a full document', () => {
    const doc = new ProductDocument();
    const schema = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });
    const result = schema.safeParse({ id: '1', title: 'x', price: 9 });

    expect(result.success).toBe(true);
  });

  test('getSchema UPDATE accepts a partial document', () => {
    const doc = new ProductDocument();
    const schema = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.UPDATE });
    const result = schema.safeParse({ price: 10 });

    expect(result.success).toBe(true);
  });

  test('getSchema caches derived schemas per (class, type)', () => {
    const doc = new ProductDocument();
    const first = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });
    const second = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });

    expect(first).toBe(second);
  });

  test('constructor accepts an explicit name override', () => {
    const doc = new ProductDocument({ name: 'custom-products' });
    expect(doc.name).toBe('custom-products');
  });

  test('constructor accepts an explicit schema override', () => {
    const override = defineSearchCollection({
      name: 'products',
      fields: [field.string('sku')],
    });
    const doc = new ProductDocument({ schema: override });

    expect(doc.schema).toBe(override);
    expect(
      doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT }).safeParse({ id: '1', sku: 'abc' })
        .success,
    ).toBe(true);
  });

  test('an explicit schema override is derived fresh, bypassing the static-definition cache', () => {
    const override = defineSearchCollection({
      name: 'products',
      fields: [field.string('sku')],
    });
    const doc = new ProductDocument({ schema: override });

    const first = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });
    const second = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });

    expect(first).not.toBe(second);
  });

  test('documentSchema override wins wholesale over DSL derivation', () => {
    class OverriddenDocument extends BaseSearchEntity {
      static override schema = defineSearchCollection({
        name: 'overridden',
        fields: [field.string('title')],
      });
      static override documentSchema = z.object({ custom: z.string() });
    }

    const doc = new OverriddenDocument();
    const selectSchema = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT });
    const updateSchema = doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.UPDATE });

    expect(selectSchema).toBe(OverriddenDocument.documentSchema);
    expect(updateSchema).toBe(OverriddenDocument.documentSchema);
    expect(selectSchema.safeParse({ custom: 'ok' }).success).toBe(true);
    expect(selectSchema.safeParse({ id: '1', title: 'x' }).success).toBe(false);
  });

  test('a bare subclass without static definition still constructs (name-only use)', () => {
    class BareDocument extends BaseSearchEntity {}

    expect(() => new BareDocument({ name: 'bare' })).not.toThrow();
    expect(new BareDocument({ name: 'bare' }).name).toBe('bare');
  });

  test('a bare subclass without static definition leaves the schema field undefined', () => {
    class BareDocument extends BaseSearchEntity {}
    const doc = new BareDocument({ name: 'bare' });

    expect(doc.schema).toBeUndefined();
  });

  test('missing definition throws on first access of getSchema', () => {
    class BareDocument extends BaseSearchEntity {}
    const doc = new BareDocument({ name: 'bare' });

    expect(() => doc.getSchema<z.ZodTypeAny>({ type: SchemaTypes.SELECT })).toThrow(
      /\[BaseSearchEntity\] Missing collection definition/,
    );
  });

  test('COLLECTION_NAME takes precedence over definition.name for entity name', () => {
    class NamedDocument extends BaseSearchEntity {
      static override COLLECTION_NAME = 'named-override';
      static override schema = defineSearchCollection({
        name: 'products',
        fields: [field.string('title')],
      });
    }

    expect(new NamedDocument().name).toBe('named-override');
  });
});
