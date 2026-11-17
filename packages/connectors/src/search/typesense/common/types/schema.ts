import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import type { CollectionSchema, CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import type { DocumentSchema } from 'typesense/lib/Typesense/Documents';

// CollectionFieldSchema is exported from Collection (singular), not Collections.
/** The `typesense` package's `DocumentSchema`. */
export type TDocumentSchema = DocumentSchema;
/** The `typesense` package's `CollectionCreateSchema`. */
export type TCollectionCreateSchema = CollectionCreateSchema;
/** The `typesense` package's `CollectionSchema`. */
export type TCollectionSchema = CollectionSchema;
/** The `typesense` package's `CollectionFieldSchema`. */
export type TCollectionFieldSchema = CollectionFieldSchema;
