/** The `typeof` result a duck-typed member must have. */
export type TDuckMemberKind = 'function' | 'string' | 'number';

export class DuckTypingUtility {
  /** The method `name` of `value`, bound to it, when it is a function; otherwise `undefined`. */
  static getMethod(opts: {
    value: unknown;
    name: string;
  }): ((...args: unknown[]) => unknown) | undefined {
    const { value, name } = opts;

    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }

    const member: unknown = Reflect.get(value, name);

    if (typeof member !== 'function') {
      return undefined;
    }

    return (...args) => Reflect.apply(member, value, args);
  }

  /** True when `value` is an object (or function) whose every listed member has the stated `typeof`; `null`, `undefined` and primitives are false. */
  static hasMembers(opts: {
    value: unknown;
    members: Readonly<Record<string, TDuckMemberKind>>;
  }): boolean {
    const { value, members } = opts;

    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }

    for (const [name, kind] of Object.entries(members)) {
      if (typeof Reflect.get(value, name) !== kind) {
        return false;
      }
    }

    return true;
  }
}
