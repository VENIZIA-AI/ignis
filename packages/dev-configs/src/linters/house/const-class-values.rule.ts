import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNode, AstNodeTypes, HOUSE_PLUGIN_NAMESPACE } from './common';

/** Utility types whose type argument is a set of keys, not an enumerable value: `Pick<T, 'a' | 'b'>`. */
const KEY_SET_TYPES = new Set(['Pick', 'Omit', 'Extract', 'Exclude', 'Record']);

/** The union is a type argument of a key-set utility type, or the key range of a mapped type. */
const isKeySet = (opts: { node: unknown }): boolean => {
  const parent = AstNode.readField({ node: opts.node, key: 'parent' });

  if (AstNode.getType({ node: parent }) === 'TSMappedType') {
    return true;
  }

  if (AstNode.getType({ node: parent }) !== 'TSTypeParameterInstantiation') {
    return false;
  }

  const reference = AstNode.readField({ node: parent, key: 'parent' });
  const name = AstNode.readField({
    node: AstNode.readField({ node: reference, key: 'typeName' }),
    key: 'name',
  });
  return (
    AstNode.getType({ node: reference }) === 'TSTypeReference' && KEY_SET_TYPES.has(String(name))
  );
};

/** The statement of the module that holds the node: the node's last ancestor before `Program`. */
const topLevelStatement = (opts: { node: unknown }): unknown => {
  let current = opts.node;

  while (current) {
    const parent = AstNode.readField({ node: current, key: 'parent' });
    if (AstNode.getType({ node: parent }) === 'Program') {
      return current;
    }
    current = parent;
  }

  return undefined;
};

const isStringLiteral = (opts: { member: unknown }): boolean => {
  const { member } = opts;
  return (
    AstNode.getType({ node: member }) === 'TSLiteralType' &&
    typeof AstNode.readField({
      node: AstNode.readField({ node: member, key: 'literal' }),
      key: 'value',
    }) === 'string'
  );
};

const isNullish = (opts: { member: unknown }): boolean => {
  const type = AstNode.getType({ node: opts.member });
  return type === 'TSNullKeyword' || type === 'TSUndefinedKeyword';
};

/**
 * `venizia/const-class-values`. An enumerable string is a const class plus `TConstValue<typeof X>`,
 * never a union of string literals in an exported declaration: a type alias, an interface member, a
 * generic constraint, a parameter or a return type of an exported function or class.
 *
 * Not counted: a union that is not all string literals (a `null` or `undefined` member is ignored),
 * a key set (`Pick`, `Omit`, `Extract`, `Exclude`, `Record` arguments and mapped-type keys), and a
 * declaration that is not exported. `namePattern` narrows the rule to exported type aliases whose name
 * matches it (`(State|Status)$`), for a project that adopts the rule one name at a time.
 */
export class ConstClassValuesRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/const-class-values`;

  static readonly RULE: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      schema: [{ type: 'object', properties: { namePattern: { type: 'string' } } }],
      messages: {
        constClass:
          'An enumerable string is a const class plus TConstValue<typeof X>, not a union of string literals.',
      },
    },
    create: (context) => {
      const options: unknown = context.options[0];
      const configured = AstNode.readField({ node: options, key: 'namePattern' });
      const namePattern = typeof configured === 'string' ? new RegExp(configured) : undefined;

      const isNamed = (opts: { statement: unknown; node: unknown }) => {
        const { statement, node } = opts;
        const declaration = AstNode.readField({ node: statement, key: 'declaration' });
        const name = AstNode.readField({
          node: AstNode.readField({ node: declaration, key: 'id' }),
          key: 'name',
        });

        return (
          namePattern === undefined ||
          (AstNode.getType({ node: declaration }) === 'TSTypeAliasDeclaration' &&
            AstNode.readField({ node: declaration, key: 'typeAnnotation' }) === node &&
            typeof name === 'string' &&
            namePattern.test(name))
        );
      };

      return {
        [AstNodeTypes.UNION_TYPE]: (node: Rule.Node) => {
          const members = AstNode.readField({ node, key: 'types' });
          if (!Array.isArray(members)) {
            return;
          }

          const values = members.filter((member) => !isNullish({ member }));
          if (values.length < 2 || !values.every((member) => isStringLiteral({ member }))) {
            return;
          }

          const statement = topLevelStatement({ node });
          const statementType = AstNode.getType({ node: statement });
          const isExported =
            statementType === AstNodeTypes.EXPORT_NAMED_DECLARATION ||
            statementType === 'ExportDefaultDeclaration';

          if (!isExported || isKeySet({ node }) || !isNamed({ statement, node })) {
            return;
          }

          context.report({ node, messageId: 'constClass' });
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; namePattern?: string } = {}): Linter.RuleEntry {
    const { severity = 'error', namePattern } = opts;
    return namePattern === undefined ? [severity] : [severity, { namePattern }];
  }
}
