import { AnyObject } from '@/common';
import { BaseHelper } from '@/modules/base';

/** An in-process keyed container, NOT an `IStorageHelper`: it stores values, not objects in a bucket. */
export class MemoryStorageHelper<T extends object = AnyObject> extends BaseHelper {
  private container = new Map<keyof T, T[keyof T]>();

  constructor(opts?: { scope?: string }) {
    super({ scope: opts?.scope ?? MemoryStorageHelper.name });
  }

  static newInstance<T extends object = AnyObject>() {
    return new MemoryStorageHelper<T>();
  }

  isBound(key: keyof T): boolean {
    return this.container.has(key);
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.container.get(key) as T[K] | undefined;
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.container.set(key, value);
  }

  /** `false` when the key was not bound, so a caller can tell a removal from a no-op. */
  unset(key: keyof T): boolean {
    return this.container.delete(key);
  }

  keys(): Array<keyof T> {
    return [...this.container.keys()];
  }

  get size(): number {
    return this.container.size;
  }

  clear(): void {
    this.container.clear();
  }

  /** A COPY: handing out the live map let a caller mutate this helper's state behind its back. */
  getContainer(): Record<string, unknown> {
    return Object.fromEntries(this.container as Map<string, unknown>);
  }
}
