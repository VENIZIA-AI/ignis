import { describe, expect, spyOn, test } from 'bun:test';
import { MailTemplateFormats } from '@/components/mail/common';
import { TemplateEngineService } from '@/components/mail/services';

const engine = new TemplateEngineService();
const render = (
  template: string,
  data: Record<string, unknown>,
  opts?: Parameters<TemplateEngineService['renderSimpleTemplate']>[2],
) => engine.renderSimpleTemplate(template, data, opts);

const failure = (run: () => unknown): { message: string; messageCode?: string } => {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return { message: error.message, messageCode: Reflect.get(error, 'normalized')?.code };
    }
  }

  throw new Error('expected the render to throw');
};

describe('sections over a list', () => {
  test('repeat the block per item, with {{.}} for a plain item', () => {
    expect(render('{{#tags}}[{{.}}]{{/tags}}', { tags: ['a', 'b', 'c'] })).toBe('[a][b][c]');
  });

  test('item keys resolve against the item first, then the outer context', () => {
    const data = { shop: 'Acme', lines: [{ name: 'Pen', qty: 2 }, { name: 'Ink' }] };

    expect(render('{{#lines}}{{name}} x{{qty}} @{{shop}};{{/lines}}', data)).toBe(
      'Pen x2 @Acme;Ink x @Acme;',
    );
  });

  test('an item key wins over the outer one of the same name', () => {
    expect(render('{{#rows}}{{name}}{{/rows}}', { name: 'outer', rows: [{ name: 'inner' }] })).toBe(
      'inner',
    );
  });

  test('dotted keys work inside an item', () => {
    expect(render('{{#rows}}{{owner.name}}{{/rows}}', { rows: [{ owner: { name: 'Ada' } }] })).toBe(
      'Ada',
    );
  });

  test('sections nest', () => {
    const data = {
      orders: [
        { id: 1, items: ['x', 'y'] },
        { id: 2, items: [] },
      ],
    };

    expect(
      render(
        '{{#orders}}#{{id}}:{{#items}}{{.}}{{/items}}{{^items}}none{{/items}};{{/orders}}',
        data,
      ),
    ).toBe('#1:xy;#2:none;');
  });

  test('an empty list renders nothing, and the inverted block renders', () => {
    expect(render('{{#list}}x{{/list}}{{^list}}empty{{/list}}', { list: [] })).toBe('empty');
  });

  test('a number item renders through {{.}}', () => {
    expect(render('{{#n}}{{.}},{{/n}}', { n: [1, 2] })).toBe('1,2,');
  });
});

describe('sections over a flag', () => {
  test.each([
    ['true', true, true],
    ['a non-empty string', 'x', true],
    ['a number', 3, true],
    ['an object', { a: 1 }, true],
    ['false', false, false],
    ['null', null, false],
    ['an empty string', '', false],
    ['zero', 0, false],
  ])('%s', (_name, flag, isShown) => {
    expect(render('{{#flag}}yes{{/flag}}{{^flag}}no{{/flag}}', { flag })).toBe(
      isShown ? 'yes' : 'no',
    );
  });

  test('an absent flag hides {{#flag}} and shows {{^flag}}', () => {
    expect(render('{{#flag}}yes{{/flag}}{{^flag}}no{{/flag}}', {})).toBe('no');
  });

  test('an object section reads its own keys, then the outer ones', () => {
    expect(render('{{#user}}{{name}}/{{site}}{{/user}}', { site: 's', user: { name: 'n' } })).toBe(
      'n/s',
    );
  });
});

describe('escaping and formats inside sections', () => {
  test('{{.}} is escaped in HTML and raw in {{{.}}} and in TEXT', () => {
    const data = { rows: ['<b>'] };

    expect(render('{{#rows}}{{.}}{{/rows}}', data)).toBe('&lt;b&gt;');
    expect(render('{{#rows}}{{{.}}}{{/rows}}', data)).toBe('<b>');
    expect(render('{{#rows}}{{.}}{{/rows}}', data, { format: MailTemplateFormats.TEXT })).toBe(
      '<b>',
    );
  });
});

describe('what is never reached', () => {
  test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'a section on %s is absent, not the prototype member',
    (key) => {
      expect(render(`{{#${key}}}yes{{/${key}}}{{^${key}}}no{{/${key}}}`, { a: 1 })).toBe('no');
    },
  );

  test('an item cannot reach the prototype either', () => {
    expect(render('{{#rows}}{{constructor}}|{{a.__proto__}}{{/rows}}', { rows: [{ a: {} }] })).toBe(
      '|',
    );
  });

  test('a function value is refused, in a slot and as a section', () => {
    expect(failure(() => render('{{fn}}', { fn: () => 'x' })).messageCode).toBe(
      'core.mail.template_invalid',
    );
    expect(failure(() => render('{{#fn}}x{{/fn}}', { fn: () => 'x' })).message).toContain(
      'function',
    );
  });

  test.each([
    ['a partial', '{{> header}}'],
    ['a delimiter change', '{{=<% %>=}}'],
    ['a comment', '{{! note }}'],
    ['an ampersand tag', '{{& raw}}'],
  ])('%s is refused, never rendered as text', (_name, template) => {
    const error = failure(() => render(template, {}));

    expect(error.messageCode).toBe('core.mail.template_invalid');
    expect(error.message).toContain('Unsupported template tag');
  });
});

describe('an object or a list in a text slot', () => {
  test.each([
    ['an object', { a: { en: 'x' } }],
    ['an array', { a: ['x'] }],
    ['a date', { a: new Date(0) }],
  ])('%s is a typed error, never [object Object]', (_name, data) => {
    const error = failure(() => render('{{a}}', data));

    expect(error.messageCode).toBe('core.mail.template_invalid');
    expect(error.message).toContain('resolve it');
  });

  test('{{.}} of an object item is refused too', () => {
    expect(failure(() => render('{{#rows}}{{.}}{{/rows}}', { rows: [{ a: 1 }] })).messageCode).toBe(
      'core.mail.template_invalid',
    );
  });
});

describe('missing values', () => {
  test("'empty' is the default: nothing, in both forms and inside an item", () => {
    expect(render('[{{a}}][{{{b}}}]{{#rows}}[{{c}}]{{/rows}}', { rows: [{}] })).toBe('[][][]');
  });

  test("'keep' leaves the tag as written, inside an item too", () => {
    expect(render('{{a}}{{#rows}}{{c}}{{/rows}}', { rows: [{}] }, { missing: 'keep' })).toBe(
      '{{a}}{{c}}',
    );
  });

  test("'throw' refuses at the first missing key, with the invalid-configuration code", () => {
    const error = failure(() => render('{{a}}{{b}}', { a: 1 }, { missing: 'throw' }));

    expect(error.message).toBe('Missing template data for keys: b');
    expect(error.messageCode).toBe('core.mail.invalid_configuration');
  });

  test('null counts as missing, false and 0 do not', () => {
    expect(render('{{a}}|{{b}}|{{c}}', { a: null, b: false, c: 0 })).toBe('|false|0');
  });

  test('requireValidate names every missing key up front, whatever missing says', () => {
    const error = failure(() =>
      render('{{a}}{{b}}', {}, { requireValidate: true, missing: 'empty' }),
    );

    expect(error.message).toBe('Missing template data for keys: a, b');
  });

  test('requireValidate does not refuse an absent section: it is an optional block', () => {
    expect(render('{{a}}{{#note}}n{{/note}}', { a: 1 }, { requireValidate: true })).toBe('1');
  });
});

describe('malformed templates', () => {
  test.each([
    ['a section left open', '{{#a}}x', 'leaves {{#a}} open'],
    ['a closing tag with no section', 'x{{/a}}', 'no section is open'],
    ['a mismatched closing tag', '{{#a}}{{#b}}x{{/a}}{{/b}}', '{{#b}} is open'],
    ['an inverted section left open', '{{^a}}x', 'leaves {{#a}} open'],
  ])('%s is a typed error', (_name, template, message) => {
    const error = failure(() => render(template, { a: 1, b: 1 }));

    expect(error.messageCode).toBe('core.mail.template_invalid');
    expect(error.message).toContain(message);
  });

  test('a {{ that is no tag stays as written', () => {
    expect(render('a {{ not a tag }} b {{', {})).toBe('a {{ not a tag }} b {{');
  });
});

describe('validateTemplateData reports section keys', () => {
  test('section keys are in allKeys and never missing; keys inside a section are not checked', () => {
    const result = engine.validateTemplateData({
      template: '{{a}}{{#items}}{{name}}{{/items}}{{^note}}x{{/note}}{{b}}',
      data: { a: 1 },
    });

    expect(result.allKeys).toEqual(['a', 'b', 'items', 'note']);
    expect(result.missingKeys).toEqual(['b']);
    expect(result.isValid).toBe(false);
  });

  test('a malformed template is refused by the validation too', () => {
    expect(
      failure(() => engine.validateTemplateData({ template: '{{#a}}', data: {} })).messageCode,
    ).toBe('core.mail.template_invalid');
  });
});

describe('a template cannot make the renderer slow or deep', () => {
  test('a long run of spaces after an opening tag is linear: no catastrophic backtracking', () => {
    const template = `{{${' '.repeat(64_000)}x`;
    const startedAt = performance.now();

    expect(render(template, {})).toBe(template);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  test('a refused tag is found at its start: a bracket inside it does not hide it', () => {
    expect(failure(() => render('{{!a } b}}', {})).messageCode).toBe('core.mail.template_invalid');
    expect(failure(() => render('{{! }}', {})).messageCode).toBe('core.mail.template_invalid');
  });

  test('sections nest to 64 and no further: the 65th is a typed error', () => {
    const nested = (depth: number) => `${'{{#a}}'.repeat(depth)}x${'{{/a}}'.repeat(depth)}`;

    expect(render(nested(64), { a: true })).toBe('x');
    const error = failure(() => render(nested(65), { a: true }));

    expect(error.messageCode).toBe('core.mail.template_invalid');
    expect(error.message).toContain('deeper than 64');
  });
});

describe('what rendered empty is logged, keys only', () => {
  const capture = (run: (instance: TemplateEngineService) => void) => {
    const instance = new TemplateEngineService();
    const lines: string[] = [];
    const scoped = instance.logger.for('renderSimpleTemplate');

    spyOn(scoped, 'warn').mockImplementation((format: string, ...args: unknown[]) => {
      lines.push([format, ...args].join(' '));
    });
    spyOn(instance.logger, 'for').mockReturnValue(scoped);
    run(instance);

    return lines;
  };

  test('one warn per render lists each empty key once, and never a value', () => {
    const lines = capture((instance) =>
      instance.renderSimpleTemplate('{{a}} {{a}} {{{b}}} {{c}}', { c: 'secret-value' }),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Keys: %s a, b');
    expect(lines[0]).not.toContain('secret-value');
  });

  test("no warn when nothing is empty, or with missing: 'keep'", () => {
    expect(capture((instance) => instance.renderSimpleTemplate('{{a}}', { a: 1 }))).toHaveLength(0);
    expect(
      capture((instance) => instance.renderSimpleTemplate('{{a}}', {}, { missing: 'keep' })),
    ).toHaveLength(0);
  });
});
