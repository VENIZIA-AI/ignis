/**
 * Resource-hierarchy matcher for casbin `g4`. Decides whether a requested resource node
 * falls under a granted resource node WITHOUT storing the "standard" edges
 * (endpoint ⊂ subject ⊂ *), which are derivable from the dotted `code`.
 *
 * Non-standard edges (e.g. `OrderItem ⊂ Order`) are NOT covered here — those are stored as
 * explicit `resource_inherits` (g4) links and resolved by casbin's role manager.
 *
 * Registered in TWO ways by the enforcer (both required):
 *   1. `enforcer.addFunction('objectMatch', objectMatch)` — lets the matcher call
 *      `objectMatch(r.obj, p.obj)` directly for "graph-free" prefix/wildcard matching. casbin's
 *      role-manager `hasLink` only traverses stored nodes, so a `g4(...)`-only call can't match
 *      `p.obj = '*'` or a subject that isn't a stored g4 vertex — the direct call covers those.
 *   2. `enforcer.addNamedMatchingFunc('g4', objectMatch)` — applies the same semantics when
 *      traversing explicit stored `resource_inherits` (g4) edges.
 *
 * @param requested the resource on the request (r.obj), e.g. `Activation.findById`
 * @param granted   the resource on the policy (p.obj), e.g. `Activation` or `*`
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
