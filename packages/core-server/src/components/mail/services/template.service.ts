import { BaseService } from '@venizia/ignis-kernel';
import type { IMailTemplateEngine, ITemplate, TMailTemplateFormat } from '../common';
import { MailErrors, MailTemplateFormats } from '../common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** `{{{key}}}` (group 1, raw) or `{{key}}` (group 2). The raw form comes first: `{{key}}` also matches inside it. */
const PLACEHOLDER = /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g;

/** In-memory template store and renderer. Templates registered here are lost on restart. */
export class TemplateEngineService extends BaseService implements IMailTemplateEngine {
  private templates: Map<string, ITemplate> = new Map();

  constructor() {
    super({ scope: TemplateEngineService.name });
    this.logger.for(this.constructor.name).info('Template engine initialized');
  }

  registerTemplate(opts: { name: string; content: string; options?: Partial<ITemplate> }): void {
    const { name, content, options } = opts;
    this.logger.for(this.registerTemplate.name).info('Registering template: %s', name);

    const template: ITemplate = {
      name,
      content,
      subject: options?.subject,
      description: options?.description,
    };

    this.templates.set(name, template);
  }

  render(opts: {
    templateData?: string;
    templateName?: string;
    data: Record<string, AnyType>;
    requireValidate?: boolean;
    format?: TMailTemplateFormat;
  }): string {
    const { templateData, templateName, data, requireValidate, format } = opts;

    if (!templateData && !templateName) {
      throw getError({ message: 'Either templateName or templateData must be provided' });
    }

    let content = templateData;

    if (!content && templateName) {
      const template = this.templates.get(templateName);

      if (!template) {
        throw getError({
          error: MailErrors.TEMPLATE_NOT_FOUND,
          message: `Template not found: ${templateName}`,
        });
      }

      this.logger.for(this.render.name).debug('Rendering template: %s', templateName);

      content = template.content;
    }

    if (content === undefined) {
      throw getError({
        error: MailErrors.INVALID_CONFIGURATION,
        message: `Template has no content: ${templateName}`,
      });
    }

    return this.renderSimpleTemplate(content, data, { requireValidate, format });
  }

  getTemplate(name: string): ITemplate | undefined {
    return this.templates.get(name);
  }

  listTemplates(): ITemplate[] {
    return Array.from(this.templates.values());
  }

  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }

  removeTemplate(name: string): boolean {
    this.logger.for(this.removeTemplate.name).info('Removing template: %s', name);

    return this.templates.delete(name);
  }

  clearTemplates(): void {
    this.logger.for(this.clearTemplates.name).info('Clearing all templates');
    this.templates.clear();
  }

  validateTemplateData(opts: { template: string; data: Record<string, AnyType> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  } {
    const { template, data } = opts;
    const allKeys: string[] = [];
    const missingKeys: string[] = [];

    for (const match of template.matchAll(PLACEHOLDER)) {
      const key = match[1] ?? match[2];

      if (allKeys.includes(key)) {
        continue;
      }

      allKeys.push(key);

      const value = this.getNestedValue(data, key);

      if (value === undefined || value === null) {
        missingKeys.push(key);
      }
    }

    const isValid = missingKeys.length === 0;

    if (!isValid) {
      this.logger
        .for(this.validateTemplateData.name)
        .warn('Template validation failed | Missing keys: %s', missingKeys.join(', '));
    }

    return { isValid, missingKeys, allKeys };
  }

  renderSimpleTemplate(
    template: string,
    data: Record<string, AnyType>,
    opts?: { requireValidate?: boolean; format?: TMailTemplateFormat },
  ): string {
    if (opts?.requireValidate) {
      const validation = this.validateTemplateData({ template, data });

      if (!validation.isValid) {
        throw getError({
          error: MailErrors.INVALID_CONFIGURATION,
          message: `Missing template data for keys: ${validation.missingKeys.join(', ')}`,
        });
      }
    }

    const isHtml = (opts?.format ?? MailTemplateFormats.HTML) === MailTemplateFormats.HTML;

    return template.replace(PLACEHOLDER, (match, tripleKey?: string, doubleKey?: string) => {
      const key = tripleKey ?? doubleKey ?? '';
      const value = this.getNestedValue(data, key);

      if (value === undefined || value === null) {
        this.logger.for(this.renderSimpleTemplate.name).warn('Missing value for key: %s', key);

        return match;
      }

      // `{{{key}}}` inserts as it is; `{{key}}` is escaped for HTML.
      return isHtml && tripleKey === undefined ? Bun.escapeHTML(String(value)) : String(value);
    });
  }

  /** Reads own properties only: `{{constructor}}` or `{{__proto__.x}}` must not reach the prototype chain. */
  private getNestedValue(obj: AnyType, path: string) {
    return path.split('.').reduce((current, key) => {
      return current !== null && typeof current === 'object' && Object.hasOwn(current, key)
        ? current[key]
        : undefined;
    }, obj);
  }
}
