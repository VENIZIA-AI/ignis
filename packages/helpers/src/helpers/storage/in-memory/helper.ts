import { AnyObject } from "@/common";
import { BaseHelper } from "@/helpers/base";

export class MemoryStorageHelper<T extends object = AnyObject> extends BaseHelper {
  private container: T;

  constructor(opts?: { scope?: string }) {
    super({
      scope: opts?.scope ?? MemoryStorageHelper.name,
    });

    this.container = Object.assign({});
  }

  static newInstance<T extends object = AnyObject>() {
    return new MemoryStorageHelper<T>();
  }

  isBound(key: string) {
    return key in this.container;
  }

  get<R>(key: keyof T) {
    return this.container[key] as R;
  }

  set<R>(key: string, value: R) {
    this.container = Object.assign(this.container, { [key]: value });
  }

  keys() {
    return Object.keys(this.container);
  }

  clear() {
    this.container = Object.assign({});
  }

  getContainer() {
    return this.container;
  }
}
