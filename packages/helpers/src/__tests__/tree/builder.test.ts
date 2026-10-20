import { describe, expect, test } from 'bun:test';
import type { ITreeNode } from '@/modules/tree';
import { TreeBuilder } from '@/modules/tree';

interface ISourceNode {
  id: string;
}

/** A -> [B, C], B -> [D], C -> [D]: D is a legitimate diamond, reachable from both B and C. */
const DIAMOND_CHILDREN: Record<string, ISourceNode[]> = {
  A: [{ id: 'B' }, { id: 'C' }],
  B: [{ id: 'D' }],
  C: [{ id: 'D' }],
  D: [],
};

describe('TreeBuilder.build', () => {
  test('builds nested children from an async getChildren fetcher', async () => {
    const tree = await TreeBuilder.build<ISourceNode>({
      rootValue: { id: 'A' },
      getChildren: async value => DIAMOND_CHILDREN[value.id] ?? [],
      getKey: value => value.id,
    });

    expect(tree.value.id).toBe('A');
    expect(tree.children.map(child => child.value.id)).toEqual(['B', 'C']);
  });

  test('accepts a synchronous getChildren just as well', async () => {
    const tree = await TreeBuilder.build<ISourceNode>({
      rootValue: { id: 'A' },
      getChildren: value => DIAMOND_CHILDREN[value.id] ?? [],
      getKey: value => value.id,
    });

    expect(tree.children.map(child => child.value.id)).toEqual(['B', 'C']);
  });

  test('a repeated key SKIPS that branch instead of throwing - a diamond is not a cycle', async () => {
    const tree = await TreeBuilder.build<ISourceNode>({
      rootValue: { id: 'A' },
      getChildren: value => DIAMOND_CHILDREN[value.id] ?? [],
      getKey: value => value.id,
    });

    const [nodeB, nodeC] = tree.children;
    // D is attached to whichever of B/C is expanded first; the other's branch is dropped, not errored.
    expect(nodeB.value.id).toBe('B');
    expect(nodeB.children.map(child => child.value.id)).toEqual(['D']);
    expect(nodeC.value.id).toBe('C');
    expect(nodeC.children).toEqual([]);
  });

  test('a true cycle (A -> B -> A) terminates instead of hanging', async () => {
    const cyclicChildren: Record<string, ISourceNode[]> = {
      A: [{ id: 'B' }],
      B: [{ id: 'A' }],
    };

    const tree = await TreeBuilder.build<ISourceNode>({
      rootValue: { id: 'A' },
      getChildren: value => cyclicChildren[value.id] ?? [],
      getKey: value => value.id,
    });

    expect(tree.children.map(child => child.value.id)).toEqual(['B']);
    expect(tree.children[0]?.children).toEqual([]);
  });
});

describe('TreeBuilder.leaves', () => {
  const buildSampleTree = (): ITreeNode<string> => ({
    value: 'root',
    children: [
      { value: 'a', children: [{ value: 'a1', children: [] }] },
      { value: 'b', children: [] },
    ],
  });

  test('without includePath, returns leaf nodes only', () => {
    const leaves = TreeBuilder.leaves({ root: buildSampleTree() });
    expect(leaves.map(node => node.value)).toEqual(['a1', 'b']);
  });

  test('includePath: true returns the path from the root alongside each leaf', () => {
    const leaves = TreeBuilder.leaves({ root: buildSampleTree(), includePath: true });

    expect(leaves.map(entry => entry.path)).toEqual([
      ['root', 'a', 'a1'],
      ['root', 'b'],
    ]);
    expect(leaves.map(entry => entry.node.value)).toEqual(['a1', 'b']);
  });
});

describe('TreeBuilder.nonLeaves', () => {
  const buildSampleTree = (): ITreeNode<string> => ({
    value: 'root',
    children: [
      { value: 'a', children: [{ value: 'a1', children: [] }] },
      { value: 'b', children: [] },
    ],
  });

  test('returns nodes that have at least one child', () => {
    const nonLeaves = TreeBuilder.nonLeaves({ root: buildSampleTree() });
    expect(nonLeaves.map(node => node.value)).toEqual(['root', 'a']);
  });

  test('includePath: true carries the path alongside each non-leaf', () => {
    const nonLeaves = TreeBuilder.nonLeaves({ root: buildSampleTree(), includePath: true });
    expect(nonLeaves.map(entry => entry.path)).toEqual([['root'], ['root', 'a']]);
  });
});

describe('TreeBuilder.print', () => {
  test('renders an ASCII tree with root first, branches indented below', () => {
    const tree: ITreeNode<string> = {
      value: 'root',
      children: [
        { value: 'a', children: [{ value: 'a1', children: [] }] },
        { value: 'b', children: [] },
      ],
    };

    expect(TreeBuilder.print({ root: tree })).toBe(
      ['root', '├── a', '│   └── a1', '└── b'].join('\n'),
    );
  });

  test('formatValue customizes each rendered line', () => {
    const tree: ITreeNode<{ name: string }> = {
      value: { name: 'root' },
      children: [{ value: { name: 'child' }, children: [] }],
    };

    expect(TreeBuilder.print({ root: tree, formatValue: value => value.name.toUpperCase() })).toBe(
      ['ROOT', '└── CHILD'].join('\n'),
    );
  });
});
