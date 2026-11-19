import type { TMailTemplateFormat, TMailTemplateMissing } from '../constants';

/** A registered mail template: `content` is the body, `subject` and `description` are optional. */
export interface ITemplate {
  name: string;
  content?: string;
  subject?: string;
  description?: string;
}

/** Stores and renders mail templates. Render with a registered `templateName` or inline `templateData`. */
export interface IMailTemplateEngine {
  render(opts: {
    templateData?: string;
    templateName?: string;
    data: Record<string, unknown>;
    /** Every key of the template is checked first and the render refuses when any is missing, naming them all; sections are not checked (an absent one is an optional block). */
    requireValidate?: boolean;
    /** What a missing placeholder renders; `THROW` refuses at the first one. @default MailTemplateMissingModes.EMPTY */
    missing?: TMailTemplateMissing;
    /** @default MailTemplateFormats.HTML */
    format?: TMailTemplateFormat;
  }): string;
  registerTemplate(opts: { name: string; content: string }): void;
  validateTemplateData(opts: { template: string; data: Record<string, unknown> }): {
    isValid: boolean;
    missingKeys: string[];
    allKeys: string[];
  };
  getTemplate(name: string): ITemplate | undefined;
  listTemplates(): ITemplate[];
  hasTemplate(name: string): boolean;
  removeTemplate(name: string): boolean;
}
