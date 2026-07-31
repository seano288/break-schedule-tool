# SWA-managed authentication, no custom password handling

We don't build our own credential storage or login flow. Users authenticate via Azure Static Web Apps' built-in auth against existing identity providers (Entra ID/Google/etc.), and the API is deployed as SWA's **managed Functions** rather than a standalone Function App, so the SWA route (`/api/*`) is the only entry point — there's no independently publicly addressable API to secure separately. This eliminates an entire class of security liability (password storage, reset flows, credential stuffing) and lets users log in with an identity they already have. The trade-off is lock-in to SWA's auth model and its supported providers — swapping to a custom auth system later means re-doing the identity layer, not just a config change.

**Status:** accepted
