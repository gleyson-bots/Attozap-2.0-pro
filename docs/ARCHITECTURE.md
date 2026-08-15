# ATTOZAP 2.0 Pro — Architecture

## Goals

- Desktop-first experience with a modern, responsive UI.
- Messaging engine isolated behind provider contracts.
- No dependency on legacy WAPIHelper/WPPHelper binaries.
- Local-first persistence using SQLite WAL, with a clear path to PostgreSQL for server deployments.
- Signed licenses with asymmetric cryptography; private signing keys never ship in the desktop app.
- Administration, RBAC, audit logs, plan entitlements and feature flags as first-class platform concepts.

## Layers

```text
Renderer (React)
  ↓ secure IPC
Electron Main
  ├─ Application Services
  ├─ Licensing
  ├─ Persistence
  └─ Messaging Provider Host
          ├─ Baileys Provider
          └─ Meta Provider (future)
```

## Security baseline

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- minimal preload API
- no private license authority key in desktop builds
- local DB in WAL mode + foreign keys + busy timeout
- secrets and session material excluded from Git
- audit trail for privileged actions

## Licensing model

The desktop validates an Ed25519-signed payload using a public key. The License Authority signs payloads with the private key in the admin/backend environment.

Entitlements are data, not hard-coded editions. A signed payload controls:

- plan
- expiration
- seat quota
- instance quota
- feature list
- optional device fingerprint

Revocation and online lease checks will be layered over the offline signature mechanism.

## Planned domain modules

- Identity & RBAC
- Tenants / Workspaces
- Licensing & Entitlements
- Instances & Sessions
- Inbox / Conversations
- Contacts & CRM
- Campaigns
- Automations
- Scheduling
- Groups
- Media
- Audit
- Notifications
- Billing
- Admin Control Center
- Observability

## Legacy migration principle

The old WASender codebase is treated as a functional catalogue, not as a base to port line-by-line. Each feature is reimplemented through domain services and provider contracts so UI, persistence and messaging transport remain independently replaceable.
