import { BaseService } from '@/base/services';
import { IMailTemplateEngine, ITemplate, MailErrorCodes } from '../common';
import { AnyType, getError } from '@/helpers';

export class TemplateEngineService extends BaseService implements IMailTemplateEngine {
  private templates: Map<string, ITemplate> = new Map();

  constructor() {
    super({ scope: TemplateEngineService.name });
    this.logger.info('[constructor] Template engine initialized');
  }

  registerTemplate(opts: { name: string; content: string; options?: Partial<ITemplate> }): void {
    const { name, content, options } = opts;
    this.logger.info('[registerTemplate] Registering template: %s', name);

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
  }): string {
    const { templateData, templateName, data, requireValidate } = opts;

    if (!templateData && !templateName) {
      throw getError({ message: 'Either templateName or templateData must be provided' });
    }

    let content = templateData;

    if (!content && templateName) {
      const template = this.templates.get(templateName);

      if (!template) {
        throw getError({
          statusCode: 404,
          messageCode: MailErrorCodes.TEMPLATE_NOT_FOUND,
          message: `Template not found: ${templateName}`,
        });
      }

      this.logger.debug('[render] Rendering template: %s', templateName);

      content = template.content;
    }

    // TODO: check content! later
    return this.renderSimpleTemplate(content!, data, { requireValidate });
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
    this.logger.info('[removeTemplate] Removing template: %s', name);
    return this.templates.delete(name);
  }

  clearTemplates(): void {
    this.logger.info('[clearTemplates] Clearing all templates');
    this.templates.clear();
  }

  validateTemplateData(opts: { template: string; data: Record<string, AnyType> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  } {
    const { template, data } = opts;
    const placeholderRegex = /\{\{(\s*[\w.]+\s*)\}\}/g;
    const allKeys: string[] = [];
    const missingKeys: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(template)) !== null) {
      const key = match[1].trim();
      if (!allKeys.includes(key)) {
        allKeys.push(key);
        const value = this.getNestedValue(data, key);
        if (value === undefined || value === null) {
          missingKeys.push(key);
        }
      }
    }

    const isValid = missingKeys.length === 0;

    if (!isValid) {
      this.logger.warn(
        '[validateTemplateData] Template validation failed | Missing keys: %s',
        missingKeys.join(', '),
      );
    }

    return { isValid, missingKeys, allKeys };
  }

  renderSimpleTemplate(
    template: string,
    data: Record<string, AnyType>,
    opts?: { requireValidate?: boolean },
  ): string {
    if (opts?.requireValidate) {
      const validation = this.validateTemplateData({ template, data });
      if (!validation.isValid) {
        throw getError({
          statusCode: 400,
          messageCode: MailErrorCodes.INVALID_CONFIGURATION,
          message: `Missing template data for keys: ${validation.missingKeys.join(', ')}`,
        });
      }
    }

    return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = this.getNestedValue(data, trimmedKey);

      if (value === undefined || value === null) {
        this.logger.warn('[renderSimpleTemplate] Missing value for key: %s', trimmedKey);
        return match;
      }

      return String(value);
    });
  }

  private getNestedValue(obj: AnyType, path: string) {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
  }
}
