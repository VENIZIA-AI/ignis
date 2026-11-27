import type { RaRecord } from 'ra-core';

/** Mirrors `TNote` from the Worker's model, in the shape react-admin records take (`id` first). */
export interface INoteRecord extends RaRecord {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
}
