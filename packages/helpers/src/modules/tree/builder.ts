import type {
  IBuildOptions,
  ILeavesOptions,
  INodeWithPath,
  IPrintOptions,
  ITreeNode,
} from './common/types';
import { BaseHelper } from '@/modules/base';

/**
 * Static members call each other through the class name (`TreeBuilder.xxx`), never `this` - a
 * detached static method loses its `this` binding.
 */
export class TreeBuilder extends BaseHelper {
  /**
   * Always async, even if `getChildren` returns a plain array, since real fetchers hit a
   * repository. De-duplicates by `getKey` rather than tracking depth - see
   * {@link IBuildOptions.getKey} for why a repeated key skips silently instead of throwing.
   */
  static async build<T>(opts: IBuildOptions<T>): Promise<ITreeNode<T>> {
    const { rootValue, getChildren, getKey } = opts;
    const seen = new Set<unknown>([getKey(rootValue)]);

    const buildNode = async (value: T): Promise<ITreeNode<T>> => {
      const childValues = await getChildren(value);
      const children: ITreeNode<T>[] = [];

      for (const childValue of childValues) {
        const key = getKey(childValue);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        children.push(await buildNode(childValue));
      }

      return { value, children };
    };

    return buildNode(rootValue);
  }

  static leaves<T>(opts: { root: ITreeNode<T>; includePath: true }): INodeWithPath<T>[];
  static leaves<T>(opts: { root: ITreeNode<T>; includePath?: false }): ITreeNode<T>[];
  /** `includePath: true` returns the chain from the root alongside each leaf - recomputing it from the tree afterward would cost a second full traversal. */
  static leaves<T>(opts: ILeavesOptions<T>): ITreeNode<T>[] | INodeWithPath<T>[] {
    return TreeBuilder.collect({ ...opts, matches: node => node.children.length === 0 });
  }

  static nonLeaves<T>(opts: { root: ITreeNode<T>; includePath: true }): INodeWithPath<T>[];
  static nonLeaves<T>(opts: { root: ITreeNode<T>; includePath?: false }): ITreeNode<T>[];
  static nonLeaves<T>(opts: ILeavesOptions<T>): ITreeNode<T>[] | INodeWithPath<T>[] {
    return TreeBuilder.collect({ ...opts, matches: node => node.children.length > 0 });
  }

  private static collect<T>(opts: {
    root: ITreeNode<T>;
    includePath?: boolean;
    matches: (node: ITreeNode<T>) => boolean;
  }): ITreeNode<T>[] | INodeWithPath<T>[] {
    const { root, includePath, matches } = opts;

    if (!includePath) {
      const results: ITreeNode<T>[] = [];

      const walk = (node: ITreeNode<T>): void => {
        if (matches(node)) {
          results.push(node);
        }

        for (const child of node.children) {
          walk(child);
        }
      };

      walk(root);
      return results;
    }

    const results: INodeWithPath<T>[] = [];

    const walk = (node: ITreeNode<T>, path: T[]): void => {
      const nextPath = [...path, node.value];
      if (matches(node)) {
        results.push({ node, path: nextPath });
      }

      for (const child of node.children) {
        walk(child, nextPath);
      }
    };

    walk(root, []);
    return results;
  }

  /** Renders an ASCII tree, root on the first line, `├──`/`└──` branches below - useful for debug logs, not for parsing. */
  static print<T>(opts: IPrintOptions<T>): string {
    const { root, formatValue = (value: T) => String(value) } = opts;
    const lines: string[] = [formatValue(root.value)];

    const walk = (node: ITreeNode<T>, prefix: string): void => {
      node.children.forEach((child, index) => {
        const isLast = index === node.children.length - 1;
        lines.push(`${prefix}${isLast ? '└── ' : '├── '}${formatValue(child.value)}`);
        walk(child, `${prefix}${isLast ? '    ' : '│   '}`);
      });
    };

    walk(root, '');
    return lines.join('\n');
  }
}
