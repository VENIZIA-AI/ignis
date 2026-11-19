import { BaseService } from '@venizia/ignis-kernel';
import type {
  IMailTemplateEngine,
  ITemplate,
  TMailTemplateFormat,
  TMailTemplateMissing,
} from '../common';
import { MailErrors } from '../common';
import { MailTemplateRenderer } from '../utilities';
import { getError } from '@venizia/ignis-helpers/core';

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
    data: Record<string, unknown>;
    requireValidate?: boolean;
    missing?: TMailTemplateMissing;
    format?: TMailTemplateFormat;
  }): string {
    const { templateData, templateName, data, requireValidate, missing, format } = opts;

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

    return this.renderSimpleTemplate(content, data, { requireValidate, missing, format });
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

  validateTemplateData(opts: { template: string; data: Record<string, unknown> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  } {
    const { template, data } = opts;
    const { valueKeys, sectionKeys } = MailTemplateRenderer.readKeys({ template });
    // A section key is reported but never missing: an absent section is an optional block, not an error.
    const allKeys = [...valueKeys, ...sectionKeys.filter((key) => !valueKeys.includes(key))];
    const missingKeys = valueKeys.filter((key) => {
      const value = MailTemplateRenderer.read({ data, key });

      return value === undefined || value === null;
    });

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
    data: Record<string, unknown>,
    opts?: {
      requireValidate?: boolean;
      missing?: TMailTemplateMissing;
      format?: TMailTemplateFormat;
    },
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

    const emptyKeys: string[] = [];
    const rendered = MailTemplateRenderer.render({
      template,
      data,
      format: opts?.format,
      missing: opts?.missing,
      onEmpty: (key) => {
        if (!emptyKeys.includes(key)) {
          emptyKeys.push(key);
        }
      },
    });

    if (emptyKeys.length > 0) {
      // Keys only, never values: a value is the recipient's data.
      this.logger
        .for(this.renderSimpleTemplate.name)
        .warn('Template rendered with empty values | Keys: %s', emptyKeys.join(', '));
    }

    return rendered;
  }
}
