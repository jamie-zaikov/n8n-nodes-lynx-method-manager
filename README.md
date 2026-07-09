# n8n-nodes-lynx-method-manager

This is an [n8n](https://n8n.io) community node package. It lets you control
**Dynamic Devices Lynx** liquid handlers from your n8n workflows via the
[Method Manager REST API](https://github.com/jamie-zaikov/method-manager-rest-api),
an HTTP control plane that proxies the MM4 TCP command surface.

[n8n](https://n8n.io) is a [fair-code](https://docs.n8n.io/reference/license/)
licensed workflow automation platform.

[Installation](#installation)
[Credentials](#credentials)
[Nodes & operations](#nodes--operations)
[Compatibility](#compatibility)
[Resources](#resources)

## Installation

Follow the
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
in the n8n documentation.

In n8n: **Settings → Community Nodes → Install**, then enter the package name:

```
n8n-nodes-lynx-method-manager
```

## Credentials

The nodes authenticate against a Method Manager REST API server with a single
credential type, **Lynx Method Manager API**:

| Field    | Description                                                          |
| -------- | ------------------------------------------------------------------- |
| Base URL | HTTP base URL of the target server, no trailing slash (e.g. `http://lm001.lab.example.com:8000`). |
| API Key  | The `X-API-Key` value for the instrument. Stored encrypted; never exported in workflow JSON. |

Create one credential per instrument. Every request is sent with the
`X-API-Key` header and is pinned to the server's `/instrument/*` route surface.

## Nodes & operations

### Lynx Method Manager (action node)

| Resource    | Operation        | Notes |
| ----------- | ---------------- | ----- |
| Method      | Run              | Sets the supplied variables in order, verifies each write succeeded, then starts the named method. Aborts the run if any variable write fails. **Destructive — physically moves the instrument.** |
| Method      | Stop             | Aborts the currently running method. **Destructive.** |
| Method      | Get State        | Reads the current method state (Idle, Busy, Paused, …). |
| Method      | Get Last Result  | Reads the outcome of the most recently completed method run. |
| Variable    | Get              | Reads a workspace variable. |
| Variable    | Set              | Writes a workspace variable. **Destructive.** |
| Application | Get State        | Reads the application-state bitmask, decoded into named flags. |
| Hardware    | Initialize       | Homes axes to a known reference state. **Destructive — physically moves the instrument.** |
| Hardware    | Clear Errors     | Clears latched fault/error state. **Destructive.** |
| Hardware    | Connect          | Re-establishes device-controller connections. **Destructive.** |

Numeric MM4 fields (error code, method state, last method result, application
state) are decoded into human-readable names/flags in the output, and the raw
values are passed through unchanged. A non-zero `error` on an HTTP 2xx response
is treated as a failure (honoring **Continue On Fail**).

### Lynx Method Manager Trigger (polling trigger)

Fires a workflow when instrument notifications arrive. On first activation it
registers a method watch plus one variable watch per configured variable name
(notifications do not fire without a prior watch), then polls
`/instrument/notifications` with a persisted cursor.

- Emits notification types: MethodComplete, VariableChanged,
  InitializationComplete, ConnectionComplete.
- Optional **Method Name Filter** — only emit MethodComplete events whose method
  name matches exactly (drops sub-method completions).
- Surfaces the server's `dropped` flag on every emitted item.

## Compatibility

- Requires n8n with Node.js `>=22`.
- Built and tested against `n8n-workflow@2.22.x`.
- Targets the Method Manager REST API `/instrument/*` surface with `X-API-Key`
  authentication.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Method Manager REST API](https://github.com/jamie-zaikov/method-manager-rest-api)
- [Dynamic Devices Lynx](https://www.dynamic-devices.com/)

## License

[MIT](LICENSE)
