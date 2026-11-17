import { describe, expect, test } from 'bun:test';
import { MailTemplateFormats, type TMailTemplateFormat } from '@/components/mail/common';
import { TemplateEngineService } from '@/components/mail/services';

const render = (opts: {
  template: string;
  data: Record<string, unknown>;
  format?: TMailTemplateFormat;
}) => new TemplateEngineService().renderSimpleTemplate(opts.template, opts.data, opts);

describe('TemplateEngineService - escaping', () => {
  test('{{key}} is HTML-escaped by default', () => {
    expect(render({ template: '{{name}}', data: { name: '<script>"&\'' } })).toBe(
      '&lt;script&gt;&quot;&amp;&#x27;',
    );
  });

  test('{{{key}}} inserts the value as it is', () => {
    expect(render({ template: '{{{html}}}', data: { html: '<b>x</b>' } })).toBe('<b>x</b>');
  });

  test('the TEXT format inserts {{key}} as it is', () => {
    expect(
      render({ template: '{{name}}', data: { name: 'a & b' }, format: MailTemplateFormats.TEXT }),
    ).toBe('a & b');
  });

  test('a missing key stays as written, in both forms', () => {
    expect(render({ template: '{{a}} {{{b}}}', data: {} })).toBe('{{a}} {{{b}}}');
  });

  test('numbers and nested own properties render', () => {
    expect(render({ template: '{{user.age}}', data: { user: { age: 7 } } })).toBe('7');
  });
});

describe('TemplateEngineService - own properties only', () => {
  test.each(['constructor', '__proto__', 'toString', 'a.constructor', 'a.__proto__.x'])(
    '{{%s}} does not reach the prototype chain',
    (key) => {
      expect(render({ template: `{{${key}}}`, data: { a: {} } })).toBe(`{{${key}}}`);
    },
  );
});

describe('TemplateEngineService - validation reads the same placeholders', () => {
  test('both forms count, once each', () => {
    const engine = new TemplateEngineService();
    const result = engine.validateTemplateData({
      template: '{{a}} {{{b}}} {{ a }} {{c.d}}',
      data: { a: 1, c: {} },
    });

    expect(result.allKeys).toEqual(['a', 'b', 'c.d']);
    expect(result.missingKeys).toEqual(['b', 'c.d']);
    expect(result.isValid).toBe(false);
  });

  test('requireValidate refuses a missing key in the triple form too', () => {
    const engine = new TemplateEngineService();

    expect(() => engine.renderSimpleTemplate('{{{b}}}', {}, { requireValidate: true })).toThrow(
      /Missing template data for keys: b/,
    );
  });
});
