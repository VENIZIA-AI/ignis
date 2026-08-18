import { Trash2 } from 'lucide-react';
import { ListBase, useDelete, useListContext, useNotify, useRefresh } from 'ra-core';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { TNoteRecord } from './types';

const NoteRows = () => {
  const { data, total, isPending, error } = useListContext<TNoteRecord>();
  const [remove] = useDelete();
  const notify = useNotify();
  const refresh = useRefresh();

  if (isPending) {
    return <p className="text-muted-foreground text-sm">Reading from PGlite...</p>;
  }

  // Surfaced, never swallowed: a Worker that failed to answer looks exactly like an empty table.
  if (error) {
    return (
      <p className="text-destructive text-sm">
        {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  const notes = data ?? [];

  if (notes.length === 0) {
    return <p className="text-muted-foreground text-sm">No notes yet. Create one above.</p>;
  }

  const onDelete = (record: TNoteRecord): void => {
    // Failure is reported from `.catch`, not from an `onError` callback: one place to keep correct,
    // and the shared lint rules want the returned promise handled rather than dropped.
    remove(
      'notes',
      { id: record.id, previousData: record },
      {
        onSuccess: () => {
          notify('Deleted');
          refresh();
        },
      },
    ).catch((deleteError: unknown) => {
      notify(deleteError instanceof Error ? deleteError.message : 'Delete failed');
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {total ?? notes.length} note(s), read through <code>DefaultRestDataProvider</code>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Body</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {notes.map(note => (
            <TableRow key={String(note.id)}>
              <TableCell className="font-medium">{note.title}</TableCell>
              <TableCell className="text-muted-foreground max-w-md truncate">
                {note.body ?? ''}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{note.createdAt}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${note.title}`}
                  onClick={() => onDelete(note)}
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export const NoteList = () => {
  return (
    // `resource` is explicit, not inherited: this list also renders on the dashboard route, which
    // carries no resource context, and `useListController` throws without one.
    <ListBase resource="notes" perPage={25} sort={{ field: 'createdAt', order: 'DESC' }}>
      <NoteRows />
    </ListBase>
  );
};
