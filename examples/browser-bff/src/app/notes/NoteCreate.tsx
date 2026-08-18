import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCreate, useNotify, useRefresh } from 'ra-core';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Field, Label } from '~/components/ui/label';

/**
 * A plain form, not a react-admin form component: `ra-core` is headless by design, so the mutation
 * hook is the whole integration and the markup stays readable.
 */
export const NoteCreate = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [create, { isPending }] = useCreate();
  const notify = useNotify();
  const refresh = useRefresh();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (title.trim().length === 0) {
      notify('Title is required');
      return;
    }

    // Failure is reported from `.catch`, not from an `onError` callback: one place to keep correct,
    // and the shared lint rules want the returned promise handled rather than dropped.
    create(
      'notes',
      { data: { title, body: body.length > 0 ? body : null } },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
          notify('Created');
          refresh();
        },
      },
    ).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : 'Create failed');
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field.Root className="flex flex-1 flex-col gap-2">
        <Label>Title</Label>
        <Input
          value={title}
          disabled={isPending}
          placeholder="Something worth keeping"
          onChange={event => setTitle(event.target.value)}
        />
      </Field.Root>

      <Field.Root className="flex flex-1 flex-col gap-2">
        <Label>Body</Label>
        <Input
          value={body}
          disabled={isPending}
          placeholder="Optional"
          onChange={event => setBody(event.target.value)}
        />
      </Field.Root>

      <Button type="submit" disabled={isPending}>
        <Plus />
        {isPending ? 'Saving...' : 'Create'}
      </Button>
    </form>
  );
};
