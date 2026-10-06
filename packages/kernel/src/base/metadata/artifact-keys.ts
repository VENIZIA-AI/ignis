import { BindingKeys } from '@/helpers/inversion';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * The one place a binding key is derived for an artifact class - shared by the decorators, the
 * registration path and any framework that registers artifacts itself, so no copy drifts.
 */
export class ArtifactBindingKeys {
  /**
   * The key a class registers under: the `binding` it pins, or `<namespace>.<ClassName>`. Only the
   * second is `isDerived` - it follows the class name, which a minified build renames.
   */
  static resolve(opts: {
    target: Function;
    namespace: string;
    binding?: { namespace: string; key: string };
  }): { key: string; isDerived: boolean } {
    const { target, namespace, binding } = opts;

    if (binding) {
      return { key: BindingKeys.build(binding), isDerived: false };
    }

    return { key: BindingKeys.build({ namespace, key: target.name }), isDerived: true };
  }

  /**
   * The keys two DIFFERENT classes derive alike in one registration. A minified build gives classes
   * in different chunks the same short name; a module evaluated twice (hot reload) or a same-named
   * subclass does too. A pinned `binding` is a deliberate choice and is never counted.
   */
  static findDerivedCollisions(opts: {
    entries: Array<{
      target: Function;
      namespace: string;
      binding?: { namespace: string; key: string };
    }>;
  }): Array<string> {
    const owners = new Map<string, Function>();
    const collisions = new Set<string>();

    for (const entry of opts.entries) {
      const { key, isDerived } = ArtifactBindingKeys.resolve(entry);
      if (!isDerived) {
        continue;
      }

      const owner = owners.get(key);
      if (owner && owner !== entry.target) {
        collisions.add(key);
      }

      owners.set(key, entry.target);
    }

    return [...collisions];
  }

  /** Throws on the first derived collision - the second binding would silently replace the first. */
  static assertNoDerivedCollision(opts: {
    entries: Array<{
      target: Function;
      namespace: string;
      binding?: { namespace: string; key: string };
    }>;
    caller: string;
  }): void {
    const [key] = ArtifactBindingKeys.findDerivedCollisions({ entries: opts.entries });
    if (key === undefined) {
      return;
    }

    throw getError({
      message: ArtifactBindingKeys.describeCollision({ key, caller: opts.caller }),
    });
  }

  static describeCollision(opts: { key: string; caller: string }): string {
    return `[${opts.caller}] Two classes derive the binding key '${opts.key}' from their class name, and the second would silently replace the first | A minified build renames classes - pin 'binding: { namespace, key }' or build with names kept (keepNames). A module evaluated twice by hot reload does the same - set 'bootChecks.allowDerivedKeyCollision' in that development setup`;
  }
}
