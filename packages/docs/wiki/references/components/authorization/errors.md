# Authorization -- Error Reference <Badge type="warning" text="Experimental" />

> Complete error messages and troubleshooting for the authorization module. See [Setup & Configuration](./) for initial setup.

## Complete Error Reference

All error messages from the authorization module, organized by source:

### Component Errors (AuthorizeComponent)

| Error Message | Status | Method |
|---------------|--------|--------|
| `[AuthorizeComponent] enforcer class is required in authorize options` | 500 | `binding` |

### Authorization Provider Errors

| Error Message | Status | Step |
|---------------|--------|------|
| `Authorization failed: No authenticated user found` | 403 | Step 2 -- User check |
| <code v-pre>Authorization denied by voter &#124; action: {{action}} &#124; resource: {{resource}}</code> | 403 | Step 5 -- Voter DENY |
| <code v-pre>Authorization denied &#124; action: {{action}} &#124; resource: {{resource}}</code> | 403 | Step 8 -- Enforcer denied |

### Enforcer Registry Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| <code v-pre>[getKey] Invalid name &#124; name: {{name}}</code> | 500 | `getKey` |
| <code v-pre>[AuthorizationEnforcerRegistry] No items registered</code> | 500 | `getDefaultName` |
| <code v-pre>[AuthorizationEnforcerRegistry] Descriptor not found: {{name}}</code> | 500 | `resolveDescriptor` |
| <code v-pre>[AuthorizationEnforcerRegistry] Failed to resolve: {{name}}</code> | 500 | `resolveDescriptor` |

### Casbin Enforcer Errors

| Error Message | Status | Method |
|---------------|--------|--------|
| `[CasbinAuthorizationEnforcer] casbin is not installed. Install it with: bun add casbin` | 500 | `configure` |
| `[CasbinAuthorizationEnforcer] casbinOptions is required when using Casbin enforcer` | 500 | `configure` |
| `[CasbinAuthorizationEnforcer] Enforcer not initialized. Call configure() first.` | 500 | `evaluate` |

## Troubleshooting

### "[AuthorizeComponent] enforcer class is required in authorize options"

**Cause:** `IAuthorizeOptions` was bound to the container but the `enforcer` field is missing or falsy.

**Fix:** Provide an enforcer class in the options:

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer, // Required
  defaultDecision: AuthorizationDecisions.DENY,
  // ...
});
```

### "Authorization failed: No authenticated user found"

**Cause:** The authorization middleware runs after authentication, but no user was found on the context (`Authentication.CURRENT_USER` is undefined). This happens when:
- The route has `authorize` but no `authenticate` config
- Authentication middleware failed silently
- Authentication was skipped but authorization was not

**Fix:** Ensure routes with `authorize` also have `authenticate`:

```typescript
this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },  // Must be present
    authorize: { action: AuthorizationActions.READ, resource: 'Article' },
    // ...
  },
  handler: async (context) => { ... },
});
```

### "Authorization denied by voter | action: ... | resource: ..."

**Cause:** A voter function explicitly returned `AuthorizationDecisions.DENY` for the request.

**Fix:** Check the voter logic. Review which voter denied the request by examining the action and resource in the error message. Common causes:
- Voter checking ownership and user is not the owner
- Voter checking time window and request is outside allowed hours
- Voter checking resource state (e.g., locked, archived)

### "Authorization denied | action: ... | resource: ..."

**Cause:** The enforcer's `evaluate()` returned `false` for the requested action/resource/conditions. This means:
- No matching rules were found and `defaultDecision` is not `'allow'`
- Matching rules exist but include a `'deny'` effect
- Matching allow rules exist but conditions don't match

**Fix:** Debug by checking:

1. **Abilities are built correctly:**
```typescript
// In your defineAbilitiesFor:
defineAbilitiesFor: ({ user, builder }) => {
  console.log('Building abilities for user:', user.userId);
  builder.allow({ action: AuthorizationActions.READ, resource: 'Article' });
  // Make sure the action/resource matches what the route specifies
},
```

2. **Conditions match:**
```typescript
// Route spec:
authorize: { action: AuthorizationActions.UPDATE, resource: 'Article', conditions: { ownerId: '123' } }

// Rule must match:
builder.allow({ action: AuthorizationActions.UPDATE, resource: 'Article', conditions: { ownerId: '123' } });
```

3. **No deny rules override:**
```typescript
// A deny rule for the same action/resource will always override an allow rule
builder.allow({ action: AuthorizationActions.DELETE, resource: 'Article' });
builder.deny({ action: AuthorizationActions.DELETE, resource: 'Article' }); // This wins
```

4. **Set defaultDecision:**
```typescript
// Without defaultDecision, no matching rules → denied
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: DefaultAuthorizationEnforcer,
  defaultDecision: AuthorizationDecisions.DENY,  // Explicit is better
  // ...
});
```

### "[AuthorizationEnforcerRegistry] No items registered"

**Cause:** Tried to get the default enforcer name but no enforcers are registered. This usually means `AuthorizeComponent` was not registered or its `binding()` was skipped (no options bound).

**Fix:** Ensure `IAuthorizeOptions` is bound **before** registering the component:

```typescript
// 1. Bind options first
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({ ... });

// 2. Then register the component
this.component(AuthorizeComponent);
```

### "[AuthorizationEnforcerRegistry] Descriptor not found: ..."

**Cause:** Tried to resolve an enforcer by a name that was never registered. This happens when `enforcerName` is specified in the `authorize()` call but doesn't match any registered enforcer.

**Fix:** Ensure the enforcer name matches what was registered. The default enforcer name comes from the enforcer class's `name` property (`'default'` for `DefaultAuthorizationEnforcer`, `'casbin'` for `CasbinAuthorizationEnforcer`).

### "[CasbinAuthorizationEnforcer] casbin is not installed"

**Cause:** The Casbin enforcer dynamically imports `casbin` at configure time, but the package is not installed.

**Fix:** Install casbin as a dependency:

```bash
bun add casbin
```

### "[CasbinAuthorizationEnforcer] casbinOptions is required"

**Cause:** Using `CasbinAuthorizationEnforcer` as the enforcer but `casbinOptions` is missing from `IAuthorizeOptions`.

**Fix:** Provide `casbinOptions` in your options:

```typescript
this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: CasbinAuthorizationEnforcer,
  casbinOptions: {
    model: '/path/to/model.conf',
    adapter: new FileAdapter('/path/to/policy.csv'),
  },
});
```

### "[CasbinAuthorizationEnforcer] Enforcer not initialized"

**Cause:** The Casbin enforcer's `evaluate()` was called before `configure()`. This should not happen when using the registry's `resolveAndConfigureEnforcer()`, but can occur if the enforcer is resolved manually.

**Fix:** Always use `resolveAndConfigureEnforcer()` instead of `resolveEnforcer()` when working with the Casbin enforcer, or ensure `configure()` is called before any evaluation.

## Common Patterns

### Authorization Works But Is Too Restrictive

Check if `defaultDecision` is set to `'deny'` (correct) but your rules don't cover all needed actions:

```typescript
// This only allows 'read', but if the route requests 'list',
// it won't match and defaultDecision kicks in
builder.allow({ action: AuthorizationActions.READ, resource: 'Article' });

// Use 'manage' to allow all actions on a resource:
builder.allow({ action: AuthorizationActions.MANAGE, resource: 'Article' });
```

### Authorization Is Not Running

Check middleware injection order:
1. Verify `authorize` is set on the route config (not just `authenticate`)
2. Verify `authenticate` is not set to `{ skip: true }` (which also skips authorization in CRUD factory)
3. Verify the component is registered

### Abilities Are Built On Every Request

Check that abilities are being cached correctly. The middleware caches on `Authorization.ABILITIES`:
- Cached per-request (each new request starts fresh)
- Multiple authorization specs on the same route share the cache
- If abilities are `undefined` or `null`, they will be rebuilt

## See Also

- [Setup & Configuration](./) -- Binding keys, options interfaces, and initial setup
- [Usage & Examples](./usage) -- Securing routes, voters, ABAC patterns, and CRUD integration
- [API Reference](./api) -- Architecture, enforcer internals, provider, and registry
