import type { ValueOrPromise } from '@/common';

/** A node produced by walking or building a tree. `children` is always an array - empty for a leaf. */
export interface ITreeNode<T> {
  value: T;
  children: ITreeNode<T>[];
}

/** A node paired with the chain of values from the root down to (and including) itself. */
export interface INodeWithPath<T> {
  node: ITreeNode<T>;
  path: T[];
}

/** Decides whether `node` at `depth` (root is depth 0) matches some condition. */
export type TNodePredicate<T> = (node: ITreeNode<T>, depth: number) => boolean;

/** Called once per visited node during a synchronous walk, with its BFS depth from the root. */
export type TOnVisit<T> = (node: ITreeNode<T>, depth: number) => void;

/** Async counterpart of {@link TOnVisit} - awaited before the walk enqueues the node's children. */
export type TOnVisitAsync<T> = (node: ITreeNode<T>, depth: number) => ValueOrPromise<void>;

/** Options for a synchronous breadth-first walk from `root`. */
export interface IWalkOptions<T> {
  root: ITreeNode<T>;
  onVisit: TOnVisit<T>;
  /** Returning true still visits `node` via `onVisit` - only its children are skipped from the queue, not the node itself. */
  shouldPrune?: TNodePredicate<T>;
}

/** Options for an asynchronous breadth-first walk from `root`; `onVisit` is awaited before the node's children are queued. */
export interface IWalkAsyncOptions<T> {
  root: ITreeNode<T>;
  onVisit: TOnVisitAsync<T>;
  shouldPrune?: TNodePredicate<T>;
}

/** Options for `heightWhere`: the greatest depth of a node for which `predicate` holds (0 when none does). */
export interface IHeightWhereOptions<T> {
  root: ITreeNode<T>;
  predicate: TNodePredicate<T>;
}

/** Options for building a tree from `rootValue` by repeatedly calling `getChildren`. */
export interface IBuildOptions<T> {
  rootValue: T;
  getChildren: (value: T) => ValueOrPromise<T[]>;
  /**
   * Identity for detecting repeats across the whole build, not just the current branch. A repeated
   * key skips that branch without throwing - legitimate diamonds (shared descendants) are not cycles.
   */
  getKey: (value: T) => unknown;
}

/** Options for collecting leaves or non-leaves. `includePath` pairs each node with its root-to-node chain of values. */
export interface ILeavesOptions<T> {
  root: ITreeNode<T>;
  includePath?: boolean;
}

/** Options for printing a tree as text. `formatValue` renders one node's value. */
export interface IPrintOptions<T> {
  root: ITreeNode<T>;
  formatValue?: (value: T) => string;
}
