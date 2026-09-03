export * from './pooler';
export * from './rls';

// Supabase's own roles and table definitions, re-exported so a schema author has one import.
export {
  anonRole,
  authenticatedRole,
  authUid,
  authUsers,
  postgresRole,
  realtimeMessages,
  realtimeTopic,
  serviceRole,
  supabaseAuthAdminRole,
} from 'drizzle-orm/supabase';

// Reachable only via `@venizia/ignis-connectors/postgres/supabase`: `postgres/index.ts` must not re-export this module, or every entry point would pull in `drizzle-orm/supabase`.
