import { AnyObject } from '@/common';

export class MemoryStorageHelper<T extends object = AnyObject> {
  private static instance: MemoryStorageHelper;
  private container: T;

  constructor() {
    this.container = Object.assign({});
  }

  static getInstance<T extends object = AnyObject>() {
    if (!this.instance) {
      this.instance = new MemoryStorageHelper<T>();
    }

    return this.instance;
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
