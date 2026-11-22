import 'reflect-metadata';

import { describe, expect, test } from 'bun:test';
import { BindingKeys } from '@/modules/binding/common/constants';
import { Container } from '@/modules/container/container';
import { metadataRegistry } from '@/modules/registry/registry';

class MailService {
  send(): string {
    return 'sent';
  }
}

class OrphanMailService {}

const containerWithMail = () => {
  const container = new Container({ scope: 'get-by-target-test' });
  const key = BindingKeys.build<MailService>({ key: 'services.MailService' });
  metadataRegistry.setBindingKey({ target: MailService, key });
  container.bind({ key }).toClass(MailService);

  return container;
};

describe('Container.get({ target })', () => {
  test('resolves a registered class, typed by the class with no cast', () => {
    const service = containerWithMail().get({ target: MailService });

    expect(service.send()).toBe('sent');
  });

  test('builds what get({ key }) builds for the same artifact', () => {
    const container = containerWithMail();
    const key = BindingKeys.build<MailService>({ key: 'services.MailService' });

    expect(container.get({ target: MailService })).toBeInstanceOf(
      container.get({ key }).constructor,
    );
  });

  test('an unregistered class throws what @inject({ target }) throws', () => {
    expect(() => containerWithMail().get({ target: OrphanMailService })).toThrow(
      /names 'OrphanMailService', which is not registered as an artifact/,
    );
  });

  test('isOptional answers undefined for an unregistered class', () => {
    const service: OrphanMailService | undefined = containerWithMail().get({
      target: OrphanMailService,
      isOptional: true,
    });

    expect(service).toBeUndefined();
  });

  test('a class sharing the key of another registered class is an error', () => {
    const container = containerWithMail();
    const registered = container.get({ target: MailService });
    class LibraryMailService {}
    metadataRegistry.setBindingKey({
      target: LibraryMailService,
      key: BindingKeys.build<unknown>({ key: 'services.MailService' }),
    });

    expect(registered).toBeInstanceOf(MailService);
    expect(() => container.get({ target: LibraryMailService })).toThrow(
      /bound to a different class named 'MailService'/,
    );
  });

  test('a key and a target together do not compile', () => {
    const container = containerWithMail();
    const key = BindingKeys.build<MailService>({ key: 'services.MailService' });

    expect(() => {
      // @ts-expect-error - a call names a key or a target, never both
      container.get({ key, target: MailService });
    }).not.toThrow();
  });
});
