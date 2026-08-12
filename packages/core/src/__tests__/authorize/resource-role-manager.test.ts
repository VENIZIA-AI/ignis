import { ResourceRoleManager } from '@/components/auth/authorize/enforcers/resource-role-manager';
import { describe, expect, it } from 'bun:test';
import type { ILogger } from '@venizia/ignis-helpers/core';

const managerWith = async (edges: Array<[string, string]>) => {
  const manager = new ResourceRoleManager();
  for (const [child, parent] of edges) {
    await manager.addLink(child, parent);
  }
  return manager;
};

describe('ResourceRoleManager', () => {
  it('resolves a direct stored edge', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    expect(manager.syncedHasLink('Order', 'Sales')).toBe(true);
  });

  it('treats a node as linked to itself', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    expect(manager.syncedHasLink('Sales', 'Sales')).toBe(true);
  });

  it('walks multiple hops', async () => {
    const manager = await managerWith([
      ['Order', 'Sales'],
      ['Sales', 'Commerce'],
    ]);
    expect(manager.syncedHasLink('Order', 'Commerce')).toBe(true);
  });

  it('resolves a dotted operation code to its resource node at depth 1', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    expect(manager.syncedHasLink('Order.deleteById', 'Sales')).toBe(true);
  });

  it('resolves a dotted code at depth 2', async () => {
    const manager = await managerWith([['Billing', 'Finance']]);
    expect(manager.syncedHasLink('Billing.Invoice.find', 'Finance')).toBe(true);
  });

  it('resolves a dotted code at depth 3', async () => {
    const manager = await managerWith([['Billing', 'Finance']]);
    expect(manager.syncedHasLink('Billing.Invoice.Line.find', 'Finance')).toBe(true);
  });

  it('reaches every stored ancestor of a dotted code, not only the deepest', async () => {
    const manager = await managerWith([
      ['Billing', 'Finance'],
      ['Billing.Invoice', 'Reporting'],
    ]);

    expect(manager.syncedHasLink('Billing.Invoice.find', 'Reporting')).toBe(true);
    expect(manager.syncedHasLink('Billing.Invoice.find', 'Finance')).toBe(true);
  });

  it('supports a multi-parent DAG', async () => {
    const manager = await managerWith([
      ['report.export', 'data.export'],
      ['report.export', 'Analytics'],
    ]);
    expect(manager.syncedHasLink('report.export', 'data.export')).toBe(true);
    expect(manager.syncedHasLink('report.export', 'Analytics')).toBe(true);
  });

  it('returns false for an unstored node', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    expect(manager.syncedHasLink('Ghost.find', 'Sales')).toBe(false);
  });

  it('reaches a stored "*" node from an arbitrary dotted request code', async () => {
    // AuthorizationPermissionBuilder.objectMatch(anything, '*') is always true, so a g4 edge whose child is '*' must stay reachable from every request object, not only from '*' itself.
    const manager = await managerWith([['*', 'Everything']]);
    expect(manager.syncedHasLink('Order.find', 'Everything')).toBe(true);
  });

  it('reaches a stored "*" node from a request code with no dots', async () => {
    const manager = await managerWith([['*', 'Everything']]);
    expect(manager.syncedHasLink('Order', 'Everything')).toBe(true);
  });

  it('does not apply the request-side dot rule to a stored node name (deliberate, see permission.builder.ts)', async () => {
    // 'Sales.internal' is a stored node, not a request object - the dot-prefix rule only walks FROM the request side, so Order does not inherit Sales's edges through it.
    const manager = await managerWith([
      ['Order', 'Sales.internal'],
      ['Sales', 'Commerce'],
    ]);
    expect(manager.syncedHasLink('Order.find', 'Commerce')).toBe(false);
  });

  it('returns false for an unrelated target', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    expect(manager.syncedHasLink('Order.find', 'Identity')).toBe(false);
  });

  it('terminates on a cycle', async () => {
    const manager = await managerWith([
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ]);
    expect(manager.syncedHasLink('A', 'C')).toBe(true);
    expect(manager.syncedHasLink('A', 'Missing')).toBe(false);
  });

  it('deduplicates repeated addLink so buildRoleLinks cycles cannot grow the graph', async () => {
    const manager = new ResourceRoleManager();
    for (let index = 0; index < 500; index++) {
      await manager.addLink('Order', 'Sales');
    }

    expect(await manager.getRoles('Order')).toEqual(['Sales']);
    expect(manager.syncedHasLink('Order.find', 'Sales')).toBe(true);
  });

  it('clear() drops every edge', async () => {
    const manager = await managerWith([['Order', 'Sales']]);
    await manager.clear();
    expect(manager.syncedHasLink('Order', 'Sales')).toBe(false);
  });

  it('deleteLink removes one parent and leaves siblings', async () => {
    const manager = await managerWith([
      ['Order', 'Sales'],
      ['Order', 'Audit'],
    ]);
    await manager.deleteLink('Order', 'Sales');
    expect(manager.syncedHasLink('Order', 'Sales')).toBe(false);
    expect(manager.syncedHasLink('Order', 'Audit')).toBe(true);
  });

  it('getUsers returns the children of a node', async () => {
    const manager = await managerWith([
      ['Order', 'Sales'],
      ['Invoice', 'Sales'],
    ]);
    expect((await manager.getUsers('Sales')).sort()).toEqual(['Invoice', 'Order']);
  });

  it('emits debug log once per graph build across many syncedHasLink calls', async () => {
    const manager = await managerWith([
      ['Order', 'Sales'],
      ['Invoice', 'Sales'],
    ]);

    const debugCalls: unknown[][] = [];
    const noop = (): void => {};
    // Fully implements ILogger (no `debug`-only partial) so no cast is needed to assign it.
    const debuggingLogger: ILogger = {
      debug: (...args: unknown[]): void => {
        debugCalls.push(args);
      },
      info: noop,
      warn: noop,
      error: noop,
      emerg: noop,
      log: noop,
      for: () => debuggingLogger,
    };
    manager.logger = debuggingLogger;

    manager.syncedHasLink('Order', 'Sales');
    manager.syncedHasLink('Invoice', 'Sales');
    manager.syncedHasLink('Order', 'Sales');
    expect(debugCalls.length).toBe(1);

    await manager.clear();
    debugCalls.length = 0;

    manager.syncedHasLink('Order', 'Sales');
    expect(debugCalls.length).toBe(1);
  });
});
