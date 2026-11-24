import { model } from '@venizia/ignis-kernel';
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { describe, expect, test } from 'bun:test';
import { ModelFactory } from '@/relational/postgres/models';
import { BaseSearchEntity, SearchCollectionFactory, field } from '@/search/core/models';

const invoices = pgTable('subject_invoice', { id: integer('id').primaryKey() });
const receipts = pgTable('subject_receipt', { id: integer('id').primaryKey() });
const notes = pgTable('subject_note', { id: integer('id').primaryKey() });

const collection = (name: string) =>
  SearchCollectionFactory.define({ name, fields: [field.string('title', { searchable: true })] });

describe('AUTHORIZATION_SUBJECT is always a string', () => {
  test('a decorated entity with a principal gets the principal', () => {
    @model({ settings: { authorize: { principal: 'billing-invoice' } } })
    class Invoice extends ModelFactory.defineEntity({ table: invoices }) {}

    const subject: string = Invoice.AUTHORIZATION_SUBJECT;

    expect(subject).toBe('billing-invoice');
  });

  test('a decorated entity without a principal gets its own name', () => {
    @model({})
    class Receipt extends ModelFactory.defineEntity({ table: receipts }) {}

    expect(Receipt.AUTHORIZATION_SUBJECT).toBe('Receipt');
  });

  test('an undecorated entity answers its name instead of undefined', () => {
    class Note extends ModelFactory.defineEntity({ table: notes }) {}

    const subject: string = Note.AUTHORIZATION_SUBJECT;

    expect(subject).toBe('Note');
  });

  test('a subclass that declares its own subject keeps it, decorated or not', () => {
    class Own extends ModelFactory.defineEntity({ table: notes }) {
      static override readonly AUTHORIZATION_SUBJECT = 'own-subject';
    }

    @model({ settings: { authorize: { principal: 'ignored' } } })
    class Declared extends ModelFactory.defineEntity({ table: receipts }) {
      static override readonly AUTHORIZATION_SUBJECT = 'declared-subject';
    }

    expect(Own.AUTHORIZATION_SUBJECT).toBe('own-subject');
    expect(Declared.AUTHORIZATION_SUBJECT).toBe('declared-subject');
  });

  test('the type is string: not undefined, not another type', () => {
    class Typed extends ModelFactory.defineEntity({ table: notes }) {}

    // @ts-expect-error a string is not a number
    const wrong: number = Typed.AUTHORIZATION_SUBJECT;

    expect(typeof wrong).toBe('string');
  });

  test('a search entity follows the same rules', () => {
    @model({ settings: { authorize: { principal: 'article' } } })
    class Article extends BaseSearchEntity {
      static override schema = collection('subject-articles');
    }

    @model({})
    class Page extends BaseSearchEntity {
      static override schema = collection('subject-pages');
    }

    class Draft extends BaseSearchEntity {
      static override schema = collection('subject-drafts');
    }

    class Chosen extends BaseSearchEntity {
      static override schema = collection('subject-chosen');
      static override readonly AUTHORIZATION_SUBJECT = 'chosen-subject';
    }

    const subject: string = Draft.AUTHORIZATION_SUBJECT;

    expect(Article.AUTHORIZATION_SUBJECT).toBe('article');
    expect(Page.AUTHORIZATION_SUBJECT).toBe('Page');
    expect(subject).toBe('Draft');
    expect(Chosen.AUTHORIZATION_SUBJECT).toBe('chosen-subject');
  });
});
