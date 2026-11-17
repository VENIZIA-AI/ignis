/**
 * The extra claims this app puts on a token, declared on `IAuthUser` where the framework exports it. After this
 * file is part of the program, `context.get(Authentication.CURRENT_USER).roles` is typed, with no cast and no parse
 * on every read. A member must be assignable to `unknown`, the type of the open `[extra]` index: any type is.
 */
declare module '@venizia/ignis' {
  interface IAuthUser {
    /** The sign-in answer lists role identifiers; a token carries role objects. */
    roles?: Array<string | { identifier: string }>;
    organizationId?: string | null;
  }
}

export {};
