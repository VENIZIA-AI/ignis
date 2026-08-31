import { AuthorizationActions } from '@venizia/ignis-kernel';
import { AuthorizationPolicyBuilder, GrantBuilder } from '@venizia/ignis-kernel';
import { extraPolicyDefinitionColumns } from '@/components/auth/models/entities/policy-definition.model';
import { pgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'bun:test';

const grantBuilder = GrantBuilder.getInstance();

describe('AuthorizationActions.CUSTOM', () => {
  it('is the custom grant sentinel', () => {
    expect(AuthorizationActions.CUSTOM).toBe('custom');
  });

  it('is accepted by isValid so the write path can check it', () => {
    expect(AuthorizationActions.isValid('custom')).toBe(true);
  });

  it('is absent from the action lattice - it is a grant mode, not an action', () => {
    const members = AuthorizationActions.LATTICE.flatMap(edge => [edge.child, edge.parent]);
    expect(members).not.toContain('custom');
  });
});

describe('GrantBuilder.parseCustomGrantMetadata', () => {
  it('accepts a well-formed ops array', () => {
    expect(
      grantBuilder.parseCustomGrantMetadata({ metadata: { ops: ['find', 'create'] } }),
    ).toEqual({
      ops: ['find', 'create'],
    });
  });

  it('de-duplicates while preserving first-seen order', () => {
    expect(
      grantBuilder.parseCustomGrantMetadata({
        metadata: { ops: ['find', 'create', 'find'] },
      }),
    ).toEqual({
      ops: ['find', 'create'],
    });
  });

  it('parses a JSON string, since some drivers return jsonb as text', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: '{"ops":["find"]}' })).toEqual({
      ops: ['find'],
    });
  });

  it('ignores unrelated metadata keys', () => {
    expect(
      grantBuilder.parseCustomGrantMetadata({
        metadata: { origin: 'commerce', ops: ['find'] },
      }),
    ).toEqual({
      ops: ['find'],
    });
  });

  it('returns null for metadata with no ops key', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: { origin: 'commerce' } })).toBeNull();
  });

  it('returns null for an empty ops array', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: { ops: [] } })).toBeNull();
  });

  it('returns null when ops is not an array', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: { ops: 'find' } })).toBeNull();
  });

  it('returns null when any op is not a non-empty string', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: { ops: ['find', ''] } })).toBeNull();
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: { ops: ['find', 7] } })).toBeNull();
  });

  it('returns null for null, undefined, a bare string and an array, logging the malformed-JSON case', () => {
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: null })).toBeNull();
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: undefined })).toBeNull();
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: 'not json' })).toBeNull();
    expect(grantBuilder.parseCustomGrantMetadata({ metadata: ['find'] })).toBeNull();
  });
});

describe('GrantBuilder.validateCustomGrantOps', () => {
  const catalog = [
    { subject: 'Order', method: 'find' },
    { subject: 'Order', method: 'create' },
    { subject: 'Invoice', method: 'find' },
  ];

  it('separates known from unknown operation names', () => {
    const result = grantBuilder.validateCustomGrantOps({
      ops: ['find', 'create', 'explode'],
      subject: 'Order',
      catalog,
    });

    expect(result.valid).toEqual(['find', 'create']);
    expect(result.unknown).toEqual(['explode']);
  });

  it('matches only within the given subject', () => {
    const result = grantBuilder.validateCustomGrantOps({
      ops: ['find'],
      subject: 'Receipt',
      catalog,
    });

    expect(result.valid).toEqual([]);
    expect(result.unknown).toEqual(['find']);
  });

  it('returns everything as unknown against an empty catalog', () => {
    const result = grantBuilder.validateCustomGrantOps({
      ops: ['find'],
      subject: 'Order',
      catalog: [],
    });

    expect(result.valid).toEqual([]);
    expect(result.unknown).toEqual(['find']);
  });

  it('does not mutate its inputs', () => {
    const ops = ['find', 'explode'];
    grantBuilder.validateCustomGrantOps({ ops, subject: 'Order', catalog });

    expect(ops).toEqual(['find', 'explode']);
  });
});

/** Backs both the runtime pgTable check below and the compile-time pin further down. */
const defaultPolicyDefinitionTable = pgTable(
  'policy_definitions_default',
  extraPolicyDefinitionColumns(),
);
type TDefaultPolicyDefinitionInsert = typeof defaultPolicyDefinitionTable.$inferInsert;

const extendedPolicyDefinitionTable = pgTable(
  'policy_definitions_extended',
  extraPolicyDefinitionColumns({ idType: 'string', extraVariants: ['merchant_role'] }),
);
type TExtendedPolicyDefinitionInsert = typeof extendedPolicyDefinitionTable.$inferInsert;

describe('extraPolicyDefinitionColumns', () => {
  it('declares a metadata column for number ids', () => {
    const columns = extraPolicyDefinitionColumns({ idType: 'number' });

    expect(columns.metadata).toBeDefined();
  });

  it('declares a metadata column for string ids', () => {
    const columns = extraPolicyDefinitionColumns({ idType: 'string' });

    expect(columns.metadata).toBeDefined();
  });

  it('keeps every pre-existing column', () => {
    const columns = extraPolicyDefinitionColumns({ idType: 'string' });

    for (const name of [
      'variant',
      'subjectType',
      'targetType',
      'action',
      'effect',
      'domain',
      'subjectId',
      'targetId',
    ]) {
      expect(columns).toHaveProperty(name);
    }
  });

  it('accepts a declared extra variant alongside the default seven, at runtime', () => {
    const columns = extraPolicyDefinitionColumns({
      idType: 'string',
      extraVariants: ['merchant_role'],
    });

    expect(columns).toHaveProperty('variant');
  });

  it('builds a real pgTable from the default and the extended column set', () => {
    expect(defaultPolicyDefinitionTable.variant).toBeDefined();
    expect(extendedPolicyDefinitionTable.variant).toBeDefined();
  });
});

/**
 * `variant`'s compile-time contract, pinned so no future change can widen it back to `string`.
 * Never executed - `tsc --noEmit` is what enforces this file, not `bun test`.
 */

export const policyDefinitionVariantContractGuard = () => {
  // Default shape: every one of the seven IGNIS variants is accepted.
  const grant: TDefaultPolicyDefinitionInsert['variant'] = 'grant';
  const assignRole: TDefaultPolicyDefinitionInsert['variant'] = 'assign_role';
  const roleInherits: TDefaultPolicyDefinitionInsert['variant'] = 'role_inherits';
  const joinDomain: TDefaultPolicyDefinitionInsert['variant'] = 'join_domain';
  const domainInherits: TDefaultPolicyDefinitionInsert['variant'] = 'domain_inherits';
  const resourceInherits: TDefaultPolicyDefinitionInsert['variant'] = 'resource_inherits';
  const actionInherits: TDefaultPolicyDefinitionInsert['variant'] = 'action_inherits';

  // Default shape: the three historically-wrong vocabularies stay compile errors.
  // @ts-expect-error 'group' was never a valid variant value
  const badGroup: TDefaultPolicyDefinitionInsert['variant'] = 'group';
  // @ts-expect-error 'policy' was never a valid variant value
  const badPolicy: TDefaultPolicyDefinitionInsert['variant'] = 'policy';
  // @ts-expect-error 'p' is a casbin rule prefix, not a variant value
  const badP: TDefaultPolicyDefinitionInsert['variant'] = 'p';
  // @ts-expect-error 'g' is a casbin rule prefix, not a variant value
  const badG: TDefaultPolicyDefinitionInsert['variant'] = 'g';

  // With `merchant_role` declared: the seven IGNIS values plus the declared extra are accepted.
  const extraGrant: TExtendedPolicyDefinitionInsert['variant'] = 'grant';
  const extraVariant: TExtendedPolicyDefinitionInsert['variant'] = 'merchant_role';

  // An undeclared value stays a compile error even once one extra variant has been declared.
  // @ts-expect-error 'affiliate_role' was never declared via extraVariants
  const undeclaredExtra: TExtendedPolicyDefinitionInsert['variant'] = 'affiliate_role';

  // AuthorizationPolicyBuilder output must still assign cleanly to the column, in both shapes.
  const grantRow = AuthorizationPolicyBuilder.grant({
    subject: { type: 'Role', id: 1 },
    permission: { type: 'Permission', id: 1 },
    action: 'read',
    effect: 'allow',
  });
  const assignRoleRow = AuthorizationPolicyBuilder.assignRole({
    user: { type: 'User', id: 1 },
    role: { type: 'Role', id: 1 },
  });

  // `domainId` is narrowed at the insert site for the same reason `subjectId`/`targetId` are: the
  // builder is id-type agnostic (`IdType`), the column is not.
  const defaultInsertFromGrant: TDefaultPolicyDefinitionInsert = {
    ...grantRow,
    subjectId: 1,
    targetId: 1,
    domainId: 1,
  };
  const defaultInsertFromAssignRole: TDefaultPolicyDefinitionInsert = {
    ...assignRoleRow,
    subjectId: 1,
    targetId: 1,
    domainId: 1,
  };
  const extendedInsertFromGrant: TExtendedPolicyDefinitionInsert = {
    ...grantRow,
    subjectId: '1',
    targetId: '1',
    domainId: '1',
  };
  const extendedInsertFromAssignRole: TExtendedPolicyDefinitionInsert = {
    ...assignRoleRow,
    subjectId: '1',
    targetId: '1',
    domainId: '1',
  };

  return [
    grant,
    assignRole,
    roleInherits,
    joinDomain,
    domainInherits,
    resourceInherits,
    actionInherits,
    badGroup,
    badPolicy,
    badP,
    badG,
    extraGrant,
    extraVariant,
    undeclaredExtra,
    defaultInsertFromGrant,
    defaultInsertFromAssignRole,
    extendedInsertFromGrant,
    extendedInsertFromAssignRole,
  ];
};

// DEFAULT_CRUD_METHODS (9) plus one custom operation, so every tier is non-empty and realistically sized: read covers FOUR operations, write FIVE.
const CATALOG = [
  { subject: 'Order', method: 'find', code: 'Order.find', action: 'read' },
  { subject: 'Order', method: 'findById', code: 'Order.findById', action: 'read' },
  { subject: 'Order', method: 'findOne', code: 'Order.findOne', action: 'read' },
  { subject: 'Order', method: 'count', code: 'Order.count', action: 'read' },
  { subject: 'Order', method: 'create', code: 'Order.create', action: 'create' },
  { subject: 'Order', method: 'updateById', code: 'Order.updateById', action: 'update' },
  { subject: 'Order', method: 'updateBy', code: 'Order.updateBy', action: 'update' },
  { subject: 'Order', method: 'deleteById', code: 'Order.deleteById', action: 'delete' },
  { subject: 'Order', method: 'deleteBy', code: 'Order.deleteBy', action: 'delete' },
  { subject: 'Order', method: 'export', code: 'Order.export', action: 'execute' },
  { subject: 'Invoice', method: 'find', code: 'Invoice.find', action: 'read' },
];

const READ_OPS = ['find', 'findById', 'findOne', 'count'];
const WRITE_OPS = ['create', 'updateById', 'updateBy', 'deleteById', 'deleteBy'];
const ALL_ORDER_OPS = [...READ_OPS, ...WRITE_OPS, 'export'];

const SUBJECT = { type: 'Role', id: 'r1' };
const RESOURCE = { type: 'Permission', id: 'p-order', subject: 'Order' };

describe('GrantBuilder.planGrant - tier intent', () => {
  it('plans one coarse row against the resource node', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { tier: AuthorizationActions.MANAGE },
      catalog: CATALOG,
    });

    expect(rows).toEqual([
      {
        variant: 'grant',
        subjectType: 'Role',
        subjectId: 'r1',
        targetType: 'Permission',
        targetId: 'p-order',
        action: 'manage',
        effect: 'allow',
        domain: null,
        domainType: null,
        domainId: null,
      },
    ]);
  });

  it('rejects a tier that is not read, write, execute or manage', () => {
    expect(() =>
      grantBuilder.planGrant({
        subject: SUBJECT,
        resource: RESOURCE,
        intent: { tier: 'create' },
        catalog: CATALOG,
      }),
    ).toThrow();
  });

  it('rejects the custom sentinel as a tier - it is an encoding marker, not an intent', () => {
    expect(() =>
      grantBuilder.planGrant({
        subject: SUBJECT,
        resource: RESOURCE,
        intent: { tier: AuthorizationActions.CUSTOM },
        catalog: CATALOG,
      }),
    ).toThrow();
  });
});

describe('GrantBuilder.planGrant - ops intent', () => {
  it('plans one per-operation row for a single op, needing no metadata column', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ['find'] },
      catalog: CATALOG,
    });

    expect(rows).toEqual([
      {
        variant: 'grant',
        subjectType: 'Role',
        subjectId: 'r1',
        targetType: 'Permission',
        targetId: 'Order.find',
        action: 'read',
        effect: 'allow',
        domain: null,
        domainType: null,
        domainId: null,
      },
    ]);
  });

  it('plans one custom row when no tier covers the selection', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ['find', 'create'] },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('custom');
    expect(rows[0].targetId).toBe('p-order');
    expect(rows[0].metadata).toEqual({ ops: ['find', 'create'] });
  });

  it('de-duplicates ops', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ['find', 'create', 'find'] },
      catalog: CATALOG,
    });

    expect(rows[0].metadata).toEqual({ ops: ['find', 'create'] });
  });
});

describe('GrantBuilder.planGrant - tier collapsing', () => {
  it('collapses every operation of the subject into one manage row', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ALL_ORDER_OPS },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('manage');
    expect(rows[0].targetId).toBe('p-order');
    expect(rows[0].metadata).toBeUndefined();
  });

  it('collapses every read operation into one read row', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: READ_OPS },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('read');
  });

  it('collapses every write operation into one write row', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: WRITE_OPS },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('write');
  });

  it('collapses read plus write into two tier rows and no custom row', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: [...READ_OPS, ...WRITE_OPS] },
      catalog: CATALOG,
    });

    expect(rows.map(row => row.action).sort()).toEqual(['read', 'write']);
    expect(rows.some(row => row.action === 'custom')).toBe(false);
  });

  it('emits a tier row plus a custom row for the uncovered remainder', () => {
    // All read ops, plus two of the three write ops - read collapses, the rest cannot.
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: [...READ_OPS, 'create', 'updateById'] },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(2);
    expect(rows[0].action).toBe('read');
    expect(rows[1].action).toBe('custom');
    expect(rows[1].metadata).toEqual({ ops: ['create', 'updateById'] });
  });

  it('emits a tier row plus a per-operation row when one op is left over', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: [...READ_OPS, 'export'] },
      catalog: CATALOG,
    });

    expect(rows.map(row => row.action).sort()).toEqual(['execute', 'read']);
  });

  it('does NOT collapse a partially covered tier - three of four read ops stays custom', () => {
    // Granting `read` here would hand over `count`, which the caller deliberately left out.
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ['find', 'findById', 'findOne'] },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('custom');
    expect(rows[0].metadata).toEqual({ ops: ['find', 'findById', 'findOne'] });
  });

  it('prefers the narrowest matching tier so a later write op is not absorbed', () => {
    const readOnlyCatalog = [
      { subject: 'Report', method: 'find', code: 'Report.find', action: 'read' },
      { subject: 'Report', method: 'count', code: 'Report.count', action: 'read' },
    ];

    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: { type: 'Permission', id: 'p-report', subject: 'Report' },
      intent: { ops: ['find', 'count'] },
      catalog: readOnlyCatalog,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('read');
  });

  it('collapses read+write into two rows, not manage, when the subject has no execute op', () => {
    // Memo shape: read and write ops only, no custom execute-tier action anywhere in the catalog.
    const memoCatalog = [
      { subject: 'Memo', method: 'find', code: 'Memo.find', action: 'read' },
      { subject: 'Memo', method: 'findById', code: 'Memo.findById', action: 'read' },
      { subject: 'Memo', method: 'create', code: 'Memo.create', action: 'create' },
      { subject: 'Memo', method: 'updateById', code: 'Memo.updateById', action: 'update' },
    ];

    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: { type: 'Permission', id: 'p-memo', subject: 'Memo' },
      intent: { ops: ['find', 'findById', 'create', 'updateById'] },
      catalog: memoCatalog,
    });

    expect(rows.map(row => row.action).sort()).toEqual(['read', 'write']);
    expect(rows.some(row => row.action === 'manage')).toBe(false);
  });

  it('collapses the 9 default CRUD ops into read+write, not manage, when there is no custom op', () => {
    const widgetCatalog = CATALOG.filter(
      entry => entry.subject === 'Order' && entry.method !== 'export',
    ).map(entry => ({ ...entry, subject: 'Widget' }));
    const widgetOps = widgetCatalog.map(entry => entry.method);

    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: { type: 'Permission', id: 'p-widget', subject: 'Widget' },
      intent: { ops: widgetOps },
      catalog: widgetCatalog,
    });

    expect(rows.map(row => row.action).sort()).toEqual(['read', 'write']);
    expect(rows.some(row => row.action === 'manage')).toBe(false);
  });

  it('still collapses into one manage row when the subject spans all three narrow tiers', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ALL_ORDER_OPS },
      catalog: CATALOG,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('manage');
  });

  it('does not silently drop an operation whose action is outside the lattice', () => {
    // 'archive-only' is not part of AuthorizationActions.LATTICE, so no tier covers it.
    const oddCatalog = [
      { subject: 'Gadget', method: 'find', code: 'Gadget.find', action: 'read' },
      { subject: 'Gadget', method: 'archive', code: 'Gadget.archive', action: 'archive-only' },
    ];

    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: { type: 'Permission', id: 'p-gadget', subject: 'Gadget' },
      intent: { ops: ['find', 'archive'] },
      catalog: oddCatalog,
    });

    expect(rows.some(row => row.action === 'manage')).toBe(false);
    expect(rows.some(row => row.action === 'read')).toBe(true);
    expect(
      rows.some(row => row.action === 'archive-only' && row.targetId === 'Gadget.archive'),
    ).toBe(true);
  });

  it('exact: true disables collapsing entirely', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ALL_ORDER_OPS },
      catalog: CATALOG,
      exact: true,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('custom');
    expect(rows[0].metadata).toEqual({ ops: ALL_ORDER_OPS });
  });

  it('still collapses tiers when custom metadata is unsupported', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: READ_OPS },
      catalog: CATALOG,
      supportsCustomMetadata: false,
    });

    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('read');
  });

  it('plans per-operation rows for the remainder when custom metadata is unsupported', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { ops: ['find', 'create'] },
      catalog: CATALOG,
      supportsCustomMetadata: false,
    });

    expect(rows.length).toBe(2);
    expect(rows.map(row => row.targetId)).toEqual(['Order.find', 'Order.create']);
    expect(rows.map(row => row.action)).toEqual(['read', 'create']);
  });

  it('throws on an op absent from the catalog for this resource subject', () => {
    expect(() =>
      grantBuilder.planGrant({
        subject: SUBJECT,
        resource: RESOURCE,
        intent: { ops: ['find', 'explode'] },
        catalog: CATALOG,
      }),
    ).toThrow();
  });

  it('throws on an op belonging to a different subject', () => {
    // `find` is genuinely in the catalog, just not under RESOURCE's subject ('Order'), so this proves the cross-subject filter rejects it rather than an empty-catalog fallback.
    expect(() =>
      grantBuilder.planGrant({
        subject: SUBJECT,
        resource: RESOURCE,
        intent: { ops: ['find'] },
        catalog: CATALOG.filter(entry => entry.subject === 'Invoice'),
      }),
    ).toThrow();
  });

  it('throws on an empty ops list', () => {
    expect(() =>
      grantBuilder.planGrant({
        subject: SUBJECT,
        resource: RESOURCE,
        intent: { ops: [] },
        catalog: CATALOG,
      }),
    ).toThrow();
  });
});

describe('GrantBuilder.planGrant - effect and domain', () => {
  it('carries an explicit effect and domain onto the planned row', () => {
    const rows = grantBuilder.planGrant({
      subject: SUBJECT,
      resource: RESOURCE,
      intent: { tier: AuthorizationActions.READ },
      catalog: CATALOG,
      effect: 'deny',
      domain: { type: 'Merchant', id: '9' },
    });

    expect(rows[0].effect).toBe('deny');
    expect(rows[0].domain).toBe('Merchant_9');
  });
});
