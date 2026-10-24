import type { Linter, Rule } from 'eslint';
import type { TRuleSeverity } from '../rules/common';
import { AstNodeTypes, HOUSE_PLUGIN_NAMESPACE, nodeType, readField } from './common';

/**
 * `venizia/const-class-values`. An enumerable string is a const class plus `TConstValue<typeof X>`,
 * never an exported union of string literals. Only a type whose name ends like a logic value is
 * checked (`State`, `Status`, `Stage`, `Mode`, `Kind`, `Type` by default): any other string union may
 * be a plain parameter type.
 */
export class ConstClassValuesRule {
  static readonly NAME = `${HOUSE_PLUGIN_NAMESPACE}/const-class-values`;

  static readonly DEFAULT_NAME_PATTERN = '(State|Status|Stage|Mode|Kind|Type)$';

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
      const configured = readField({ node: options, key: 'namePattern' });
      const namePattern = new RegExp(
        typeof configured === 'string' ? configured : ConstClassValuesRule.DEFAULT_NAME_PATTERN,
      );

      const isStringLiteral = (member: unknown) =>
        nodeType({ node: member }) === 'TSLiteralType' &&
        typeof readField({ node: readField({ node: member, key: 'literal' }), key: 'value' }) ===
          'string';

      return {
        [`${AstNodeTypes.EXPORT_NAMED_DECLARATION} > TSTypeAliasDeclaration`]: (
          node: Rule.Node,
        ) => {
          const id = readField({ node, key: 'id' });
          const name = readField({ node: id, key: 'name' });
          const typeAnnotation = readField({ node, key: 'typeAnnotation' });
          const members = readField({ node: typeAnnotation, key: 'types' });

          if (
            typeof name === 'string' &&
            namePattern.test(name) &&
            nodeType({ node: typeAnnotation }) === 'TSUnionType' &&
            Array.isArray(members) &&
            members.every(isStringLiteral)
          ) {
            context.report({ node, messageId: 'constClass' });
          }
        },
      };
    },
  };

  static build(opts: { severity?: TRuleSeverity; namePattern?: string } = {}): Linter.RuleEntry {
    const { severity = 'error', namePattern = ConstClassValuesRule.DEFAULT_NAME_PATTERN } = opts;
    return [severity, { namePattern }];
  }
}
