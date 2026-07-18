/**
 * g4 resource matcher (r.obj vs p.obj): derives standard edges (endpoint ⊂ subject ⊂ `*`) from the
 * dotted code; non-standard nesting stays explicit stored g4 edges. Registered BOTH directly via
 * addFunction (hasLink only walks stored nodes - the direct call covers `*`/unstored subjects) AND as g4's matching func.
 */
export const objectMatch = (requested: string, granted: string): boolean => {
  if (granted === '*') {
    return true;
  }

  if (requested === granted) {
    return true;
  }

  return requested.startsWith(`${granted}.`);
};
