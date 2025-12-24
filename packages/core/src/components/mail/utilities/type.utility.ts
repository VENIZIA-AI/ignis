import { AnyType } from '@/helpers';
import { IMailTransport, TMailOptions } from '../common';

export function isMailTransport(value: AnyType): value is IMailTransport {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const transport = value as Record<string, unknown>;

  if (typeof transport.send !== 'function') {
    return false;
  }

  if (typeof transport.verify !== 'function') {
    return false;
  }

  if (transport.close !== undefined && typeof transport.close !== 'function') {
    return false;
  }

  return true;
}

export function isValidMailOptions(options: AnyType): options is TMailOptions {
  if (!options || typeof options !== 'object') {
    return false;
  }

  const opts = options as Record<string, unknown>;

  if (typeof opts.provider !== 'string') {
    return false;
  }

  if (!opts.config) {
    return false;
  }

  return true;
}
