import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { CollectionSchema, CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import type { DocumentSchema } from 'typesense/lib/Typesense/Documents';

// CollectionFieldSchema is exported from Collection (singular), not Collections.
export type TDocumentSchema = DocumentSchema;
export type TCollectionCreateSchema = CollectionCreateSchema;
export type TCollectionSchema = CollectionSchema;
export type TCollectionFieldSchema = CollectionFieldSchema;
