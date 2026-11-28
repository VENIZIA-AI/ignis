import type { SQLiteTextBuilderInitial } from 'drizzle-orm/sqlite-core';

/** A text column as `text()` first builds it, before any modifier. */
export type TSQLiteTextColumn = SQLiteTextBuilderInitial<string, [string, ...string[]], undefined>;
