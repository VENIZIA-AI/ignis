# Binding Keys

The Request Tracker component uses a single internal binding key. It is registered automatically and does not require manual binding.

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `middlewares.RequestSpyMiddleware` | `RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY` | `MiddlewareHandler` | Auto | Provided by component |

The key is constructed from `BindingNamespaces.MIDDLEWARE` + `RequestSpyMiddleware.name`, resulting in `middlewares.RequestSpyMiddleware`. The component binds `RequestSpyMiddleware` as a singleton provider at this key during construction.
