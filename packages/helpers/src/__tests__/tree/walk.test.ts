import { describe, expect, test } from 'bun:test';
import type { ITreeNode } from '@/modules/tree';
import { TreeBuilder, TreeWalker } from '@/modules/tree';

const buildSampleTree = (): ITreeNode<string> => ({
  value: 'root',
  children: [
    {
      value: 'a',
      children: [
        { value: 'a1', children: [] },
        { value: 'a2', children: [] },
      ],
    },
    { value: 'b', children: [{ value: 'b1', children: [] }] },
  ],
});

describe('TreeWalker.walk', () => {
  test('visits nodes level by level with correct depth', () => {
    const visited: Array<{ value: string; depth: number }> = [];

    TreeWalker.walk({
      root: buildSampleTree(),
      onVisit: (node, depth) => visited.push({ value: node.value, depth }),
    });

    expect(visited).toEqual([
      { value: 'root', depth: 0 },
      { value: 'a', depth: 1 },
      { value: 'b', depth: 1 },
      { value: 'a1', depth: 2 },
      { value: 'a2', depth: 2 },
      { value: 'b1', depth: 2 },
    ]);
  });

  test('shouldPrune returning true still visits the node - only its children are skipped from the queue', () => {
    const visited: string[] = [];

    TreeWalker.walk({
      root: buildSampleTree(),
      onVisit: node => visited.push(node.value),
      shouldPrune: (node, depth) => depth === 1 && node.value === 'a',
    });

    // 'a' is the boundary node and must be counted; 'a1'/'a2' beneath it must not.
    expect(visited).toEqual(['root', 'a', 'b', 'b1']);
  });

  test('an empty queue tolerates a root with no children', () => {
    const visited: string[] = [];

    TreeWalker.walk({
      root: { value: 'solo', children: [] },
      onVisit: node => visited.push(node.value),
    });

    expect(visited).toEqual(['solo']);
  });
});

describe('TreeWalker.walkAsync', () => {
  test('mirrors walk order while awaiting each visit', async () => {
    const visited: string[] = [];

    await TreeWalker.walkAsync({
      root: buildSampleTree(),
      onVisit: async node => {
        await Promise.resolve();
        visited.push(node.value);
      },
    });

    expect(visited).toEqual(['root', 'a', 'b', 'a1', 'a2', 'b1']);
  });

  test('shouldPrune returning true still visits the node, same as the sync walk', async () => {
    const visited: string[] = [];

    await TreeWalker.walkAsync({
      root: buildSampleTree(),
      onVisit: async node => {
        visited.push(node.value);
      },
      shouldPrune: (node, depth) => depth === 1 && node.value === 'a',
    });

    expect(visited).toEqual(['root', 'a', 'b', 'b1']);
  });
});

describe('TreeWalker.height', () => {
  test('a lone root has height 0', () => {
    expect(TreeWalker.height({ root: { value: 'root', children: [] } })).toBe(0);
  });

  test('returns the longest root-to-leaf path, in edges', () => {
    expect(TreeWalker.height({ root: buildSampleTree() })).toBe(2);
  });
});

describe('TreeWalker.heightWhere', () => {
  test('only nodes matching the predicate count toward the maximum', () => {
    const height = TreeWalker.heightWhere({
      root: buildSampleTree(),
      predicate: node => node.value === 'root' || node.value === 'a',
    });

    expect(height).toBe(1);
  });

  test('returns 0 when nothing matches', () => {
    const height = TreeWalker.heightWhere({ root: buildSampleTree(), predicate: () => false });
    expect(height).toBe(0);
  });
});

describe('TreeWalker.count', () => {
  test('counts every node, root included', () => {
    expect(TreeWalker.count({ root: buildSampleTree() })).toBe(6);
  });
});

describe('TreeBuilder.leaves', () => {
  test('returns only nodes with no children', () => {
    const leaves = TreeBuilder.leaves({ root: buildSampleTree() });
    expect(leaves.map(node => node.value)).toEqual(['a1', 'a2', 'b1']);
  });
});
