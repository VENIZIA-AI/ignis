import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { NoteCreate } from './NoteCreate';
import { NoteList } from './NoteList';

/** One route holding both halves - the example is about the data path, not about navigation. */
export const NoteScreen = () => {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">IGNIS browser BFF</h1>
        <p className="text-muted-foreground text-sm">
          react-admin talks to <code>DefaultRestDataProvider</code>, which calls <code>fetch</code>,
          which is answered by an IGNIS application running in a dedicated Worker over PGlite in
          OPFS. No server is running.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New note</CardTitle>
          <CardDescription>Written through the data provider, stored in OPFS.</CardDescription>
        </CardHeader>
        <CardContent>
          <NoteCreate />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Survives a reload - the database lives in the browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <NoteList />
        </CardContent>
      </Card>
    </main>
  );
};
