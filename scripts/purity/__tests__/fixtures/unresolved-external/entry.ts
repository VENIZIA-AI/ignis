// The sibling `package.json`'s `browser` field remaps this specifier to `false` - the standard npm
// convention a package uses to disable a Node-only dependency in browser builds. Bun honours the
// remap, leaves the import external, and exits 0 - the specifier is not a Node builtin, so this is
// not caught by `findBuiltinSpecifiers` at all; only the unresolved-external check sees it.
import { doSomething } from 'native-only-dependency';

export const useIt = (): unknown => doSomething();
