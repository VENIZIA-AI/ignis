/**
 * Anchors a value on the realm instead of on a module.
 *
 * Two copies of `@venizia/ignis-kernel` can end up in one install without either package changing:
 * `@venizia/ignis` and `@venizia/ignis-connectors` each pin a range, and the day those ranges stop
 * intersecting a package manager installs a nested second copy rather than failing. Module-level
 * statics then split in two, and nothing throws - `@repository` writes into one `datasourceModels`
 * map while `discoverSchema()` reads the other, `buildSchema()` returns `{}`, and every query fails
 * for a reason that points nowhere near the cause.
 *
 * `Symbol.for` is keyed on a global registry per realm, so both copies resolve the same symbol and
 * therefore the same instance. A browser tab and its Worker are separate realms and still get one
 * registry each, which is correct - they run separate applications.
 */
export class SingletonRealm {
  private static readonly ANCHOR_PREFIX = '@venizia/ignis-kernel:';

  /**
   * Anchors are memoized, not the values: an anchored value is created once and only ever mutated,
   * so re-deriving its symbol per call buys nothing. The audit enrichers reach this twice per
   * inserted row.
   */
  private static readonly anchors = new Map<string, symbol>();

  /** The realm's own singleton for `key`, created on first call and shared by every copy of this package. */
  static resolve<T>(opts: { key: string; create: () => T }): T {
    const { key, create } = opts;

    const anchor = this.anchorFor({ key });
    const realm = globalThis as unknown as Record<symbol, T>;

    // `in`, not a truthiness check: a holder whose only field is still `undefined` is a legitimate
    // resolved value, and re-creating it would hand every caller a fresh slot.
    if (anchor in realm) {
      return realm[anchor];
    }

    const created = create();
    realm[anchor] = created;

    return created;
  }

  private static anchorFor(opts: { key: string }): symbol {
    const { key } = opts;

    const cached = this.anchors.get(key);
    if (cached) {
      return cached;
    }

    const anchor = Symbol.for(`${this.ANCHOR_PREFIX}${key}`);
    this.anchors.set(key, anchor);

    return anchor;
  }
}
