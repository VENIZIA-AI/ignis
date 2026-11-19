import { getError } from '@venizia/ignis-helpers/core';
import { MailErrors, MailTemplateFormats, MailTemplateMissingModes } from '../common';
import type { TMailTemplateFormat, TMailTemplateMissing } from '../common';

/**
 * One tag: `{{{key}}}` (group 1), or a placeholder or a section tag (group 2 the sigil `#`, `^` or `/`, group 3 the key; a lone `.` is the current
 * item). The last form only finds the start of a Mustache partial, comment, delimiter change or `&` tag: those are refused. Any other `{{` stays as written.
 */
const TAG = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*(?:([#^/])\s*)?([\w.]+)\s*\}\}|\{\{\s*[>=!&<]/g;

/** How many sections may be open at once: deeper than any real template, and a bound on the scope stack. */
const MAX_DEPTH = 64;

type TNode =
  | { type: 'text'; text: string }
  | { type: 'value'; key: string; isRaw: boolean; source: string }
  | { type: 'section'; key: string; isInverted: boolean; children: TNode[] };

/** Renders placeholders (escaped, raw and dotted) and sections (a list, a flag, its inverse): no partial, no lambda, no delimiter change, no code. */
export class MailTemplateRenderer {
  private static invalid(opts: { message: string }) {
    return getError({ error: MailErrors.TEMPLATE_INVALID, message: opts.message });
  }

  /** Splits a template into text, values and sections; a closing tag that does not match, a section left open and a tag this renderer does not have throw. */
  private static parse(opts: { template: string }): TNode[] {
    const { template } = opts;
    const root: TNode[] = [];
    const open: Array<{ key: string; parent: TNode[] }> = [];
    let current = root;
    let cursor = 0;

    for (const match of template.matchAll(TAG)) {
      const [source, rawKey, sigil, key] = match;

      current.push({ type: 'text', text: template.slice(cursor, match.index) });
      cursor = match.index + source.length;

      if (rawKey === undefined && key === undefined) {
        throw MailTemplateRenderer.invalid({ message: `Unsupported template tag: ${source}` });
      }

      if (sigil === '#' || sigil === '^') {
        if (open.length >= MAX_DEPTH) {
          throw MailTemplateRenderer.invalid({
            message: `Template nests sections deeper than ${MAX_DEPTH}`,
          });
        }

        const children: TNode[] = [];

        current.push({ type: 'section', key, isInverted: sigil === '^', children });
        open.push({ key, parent: current });
        current = children;
      } else if (sigil === '/') {
        const closing = open.pop();

        if (closing?.key !== key) {
          throw MailTemplateRenderer.invalid({
            message: `Template closes {{/${key}}} but ${closing ? `{{#${closing.key}}} is open` : 'no section is open'}`,
          });
        }

        current = closing.parent;
      } else {
        current.push({ type: 'value', key: rawKey ?? key, isRaw: rawKey !== undefined, source });
      }
    }

    if (open.length > 0) {
      throw MailTemplateRenderer.invalid({
        message: `Template leaves {{#${open[open.length - 1].key}}} open`,
      });
    }

    current.push({ type: 'text', text: template.slice(cursor) });

    return root;
  }

  /** The keys a template reads outside any section, and the keys of its sections (a section body reads the item first, so its keys are not the data's to check). */
  static readKeys(opts: { template: string }): { valueKeys: string[]; sectionKeys: string[] } {
    const valueKeys: string[] = [];
    const sectionKeys: string[] = [];

    const visit = (nodes: TNode[], isTopLevel: boolean) => {
      for (const node of nodes) {
        if (
          node.type === 'value' &&
          isTopLevel &&
          node.key !== '.' &&
          !valueKeys.includes(node.key)
        ) {
          valueKeys.push(node.key);
        }

        if (node.type === 'section') {
          if (!sectionKeys.includes(node.key)) {
            sectionKeys.push(node.key);
          }

          visit(node.children, false);
        }
      }
    };

    visit(MailTemplateRenderer.parse(opts), true);

    return { valueKeys, sectionKeys };
  }

  /** Own properties only, so a key such as `constructor` or `__proto__.x` never reaches the prototype chain. The first segment picks the innermost scope that has it. */
  private static lookup(opts: { scopes: unknown[]; key: string }): unknown {
    const { scopes, key } = opts;

    if (key === '.') {
      return scopes[scopes.length - 1];
    }

    const [head, ...rest] = key.split('.');
    let start: unknown;

    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scope = scopes[index];

      if (scope !== null && typeof scope === 'object' && Object.hasOwn(scope, head)) {
        start = Reflect.get(scope, head);
        break;
      }
    }

    return rest.reduce<unknown>(
      (current, segment) =>
        current !== null && typeof current === 'object' && Object.hasOwn(current, segment)
          ? Reflect.get(current, segment)
          : undefined,
      start,
    );
  }

  /** The value of `key` in `data` (own properties only), or `undefined`. */
  static read(opts: { data: Record<string, unknown>; key: string }): unknown {
    return MailTemplateRenderer.lookup({ scopes: [opts.data], key: opts.key });
  }

  static render(opts: {
    template: string;
    data: Record<string, unknown>;
    format?: TMailTemplateFormat;
    missing?: TMailTemplateMissing;
    /** Called with the key of every placeholder that rendered empty because the data had no value (never the value). */
    onEmpty?: (key: string) => void;
  }): string {
    const {
      template,
      data,
      format = MailTemplateFormats.HTML,
      missing = MailTemplateMissingModes.EMPTY,
      onEmpty,
    } = opts;

    return MailTemplateRenderer.renderNodes({
      nodes: MailTemplateRenderer.parse({ template }),
      scopes: [data],
      isHtml: format === MailTemplateFormats.HTML,
      missing,
      onEmpty,
    });
  }

  private static renderNodes(opts: {
    nodes: TNode[];
    scopes: unknown[];
    isHtml: boolean;
    missing: TMailTemplateMissing;
    onEmpty?: (key: string) => void;
  }): string {
    const { nodes, scopes, isHtml, missing, onEmpty } = opts;
    let out = '';

    for (const node of nodes) {
      if (node.type === 'text') {
        out += node.text;
        continue;
      }

      const value = MailTemplateRenderer.lookup({ scopes, key: node.key });

      if (typeof value === 'function') {
        throw MailTemplateRenderer.invalid({
          message: `Template value is a function: ${node.key}`,
        });
      }

      if (node.type === 'section') {
        const isEmpty = !value || (Array.isArray(value) && value.length === 0);

        if (node.isInverted) {
          out += isEmpty
            ? MailTemplateRenderer.renderNodes({
                nodes: node.children,
                scopes,
                isHtml,
                missing,
                onEmpty,
              })
            : '';
        } else if (!isEmpty) {
          // A list repeats per item, anything else truthy renders once; `{{.}}` is the item, and its keys come before the outer ones.
          for (const item of Array.isArray(value) ? value : [value]) {
            out += MailTemplateRenderer.renderNodes({
              nodes: node.children,
              scopes: [...scopes, item],
              isHtml,
              missing,
              onEmpty,
            });
          }
        }

        continue;
      }

      if (value === undefined || value === null) {
        if (missing === MailTemplateMissingModes.THROW) {
          throw getError({
            error: MailErrors.INVALID_CONFIGURATION,
            message: `Missing template data for keys: ${node.key}`,
          });
        }

        if (missing === MailTemplateMissingModes.KEEP) {
          out += node.source;
        } else {
          onEmpty?.(node.key);
        }

        continue;
      }

      if (typeof value === 'object') {
        throw MailTemplateRenderer.invalid({
          message: `Template value is an object or a list, not text: ${node.key} | resolve it (a locale, a date) before rendering`,
        });
      }

      // `{{{key}}}` inserts as it is; `{{key}}` is escaped for HTML.
      out += isHtml && !node.isRaw ? Bun.escapeHTML(String(value)) : String(value);
    }

    return out;
  }
}
