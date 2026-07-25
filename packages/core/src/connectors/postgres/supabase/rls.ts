import type { IDatabaseTransaction } from '@/connectors/postgres/datasources';
import { getError } from '@venizia/ignis-helpers';
import { sql } from 'drizzle-orm';

/** A bare Postgres role identifier. Anything else cannot be safely interpolated. */
const ROLE_PATTERN = /^[a-z_][a-z0-9_]*$/;

/** Sets the Supabase auth context for THIS transaction so `auth.uid()` resolves in RLS policies. `SET LOCAL` only - plain `SET` would leak the identity to the connection's next borrower under a pooler. `role` defaults to the JWT's own `role` claim, the only default that cannot contradict `request.jwt.claims`. */
export const withAuthContext = async (opts: {
  transaction: IDatabaseTransaction;
  claims: Record<string, unknown>;
  role?: string;
}): Promise<void> => {
  const { transaction, claims } = opts;

  const roleClaim = claims['role'];
  const role = opts.role ?? (typeof roleClaim === 'string' ? roleClaim : undefined);

  // `set local role $1` is not valid SQL, so the role is interpolated - unvalidated that is a privilege-escalation vector. Validated before any statement runs, so a rejected call leaves the session untouched.
  if (!role || !ROLE_PATTERN.test(role)) {
    throw getError({
      message: `[withAuthContext] Invalid role '${role ?? ''}' | Pass role explicitly or include a string 'role' claim | A role must match ${String(ROLE_PATTERN)}`,
    });
  }

  // `claims` IS parameterizable, so it is bound rather than interpolated.
  await transaction.connector.execute(
    sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`,
  );

  await transaction.connector.execute(sql.raw(`set local role ${role}`));
};
