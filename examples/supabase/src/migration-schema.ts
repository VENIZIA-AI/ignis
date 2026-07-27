/**
 * drizzle-kit expects raw pgTable() exports, not class references. This file re-exports the `.schema`
 * static of each entity so drizzle-kit can detect the tables - and, here, their RLS policies.
 */
import { Note } from './models/entities/note.model';

export const note = Note.schema;
