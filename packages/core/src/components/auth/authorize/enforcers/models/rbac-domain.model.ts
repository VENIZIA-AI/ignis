/**
 * Scoped RBAC model (v2) — resource/action/domain hierarchies + membership + allow-and-deny.
 *
 * Effect = casbin's predefined `allow-and-deny` effector
 * (`some(where (p.eft == allow)) && !some(where (p.eft == deny))`): default-DENY — a request needs a
 * matching `allow` AND no matching `deny`, so an explicit deny overrides any allow. NOTE this is NOT
 * casbin's `deny-override` effector (`!some(where (p.eft == deny))`), which would be default-ALLOW.
 *
 * Grouping relations (casbin name → meaning). Numbered in request-tuple order (sub → dom → obj → act)
 * so the matcher reads left-to-right:
 *   g  = assign_role (user→role) + role_inherits (role→role), domain-aware. The `sub` axis.
 *        Registered with a KEY_MATCH domain function so a `*` domain on a link matches any request domain.
 *   g2 = join_domain (user→domain membership). The `dom` axis (membership). Plain edges.
 *   g3 = domain_inherits (e.g. Branch ⊂ Company). The `dom` axis (nesting). Plain edges + self-link;
 *        self-link also serves domain-specific grants (g3(Merchant_7, Merchant_7) = true).
 *   g4 = resource_inherits. The `obj` axis. Used for explicit non-standard nesting edges (e.g. OrderItem ⊂ Order).
 *        Registered with `objectMatch` as matching func for proper edge traversal.
 *        Free prefix/wildcard matching (endpoint ⊂ subject ⊂ *) is handled by `objectMatch` called
 *        directly in the matcher expression — casbin's role-manager hasLink only traverses stored nodes,
 *        so the function must also appear directly for "graph-free" cases.
 *   g5 = action_inherits (e.g. read ⊂ manage). The `act` axis. Plain edges + self-link.
 *
 * Domain clause: a grant's domain is one of
 *   - SYSTEM_WIDE  → matches every domain, bypassing membership (super-admin)
 *   - ANY_MEMBER   → matches every domain the subject joined (g2)
 *   - <Type_id>    → that domain (or a nested child via g3)
 *
 * NOTE: relies on DefaultRoleManager self-link (hasLink(name, name) === true) for g3/g4/g5.
 * Keep the default role manager, or any custom one must preserve self-links.
 */
export const CASBIN_RBAC_DOMAIN_SCOPED_MODEL = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act, eft

[role_definition]
g = _, _, _
g2 = _, _
g3 = _, _
g4 = _, _
g5 = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = g(r.sub, p.sub, r.dom) && (p.dom == "SYSTEM_WIDE" || (p.dom == "ANY_MEMBER" && g2(r.sub, r.dom)) || g3(r.dom, p.dom)) && (objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)) && g5(r.act, p.act)
`;
