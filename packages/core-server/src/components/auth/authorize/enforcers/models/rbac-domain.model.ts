// Relation semantics live on AuthorizationPolicyVariants; g's KEY_MATCH domain fn makes `*`-domain links match any request domain; `objectMatch` appears directly in the matcher because hasLink only walks stored nodes.
// g3/g4/g5 rely on DefaultRoleManager self-links (hasLink(name, name)) - a custom role manager must preserve them.
/** Scoped RBAC model (v2). Effect = casbin `allow-and-deny` (default-DENY: needs a matching allow AND no matching deny), NOT `deny-override` (default-ALLOW). */
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
