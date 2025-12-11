import { generatePrincipalColumnDefs, TColumnDefinitions } from "@/base/models";
import { integer, text } from "drizzle-orm/pg-core";

// -------------------------------------------------------------------------------------------
export const extraUserRoleColumns = (opts?: {
  idType: "string" | "number";
}): TColumnDefinitions => {
  return {
    ...generatePrincipalColumnDefs({ defaultPolymorphic: "Role", polymorphicIdType: "number" }),
    userId: opts?.idType === "string" ? text("user_id") : integer("user_id"),
  };
};

/* export class BaseNumberUserRole extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: enrichPrincipal(
        Object.assign({}, { userId: integer('user_id') }, opts.columns ?? {}),
        { defaultPolymorphic: 'Role', polymorphicIdType: 'number' },
      ),
    });
  }
}

export class BaseStringUserRole extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: enrichPrincipal(Object.assign({}, { userId: text('user_id') }, opts.columns ?? {}), {
        defaultPolymorphic: 'Role',
        polymorphicIdType: 'string',
      }),
    });
  }
} */
