import { TColumnDefinitions } from "@/base/models";
import { UserStatuses, UserTypes } from "@/common";
import { integer, text, timestamp } from "drizzle-orm/pg-core";

// -------------------------------------------------------------------------------------------
export const extraUserColumns = (opts?: { idType: "string" | "number" }): TColumnDefinitions => {
  return {
    realm: text("realm").default(""),
    status: text("status").notNull().default(UserStatuses.UNKNOWN),
    type: text("type").notNull().default(UserTypes.SYSTEM),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { mode: "date", withTimezone: true }),
    parentId: opts?.idType === "string" ? text("parent_id") : integer("parent_id"),
  };
};

// -------------------------------------------------------------------------------------------
/* export class BaseNumberUser extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign({}, extraUserColumns, opts.columns ?? {}),
    });
  }
}

export class BaseStringUser extends Object {
  constructor(opts: { name: string; schema?: string; columns?: TColumnDefinitions }) {
    super({
      ...opts,
      columns: Object.assign({}, extraUserColumns, opts.columns ?? {}),
    });
  }
} */
