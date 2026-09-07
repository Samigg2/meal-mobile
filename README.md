# RAYEE II MEAL MIS — Mobile field app

React Native (Expo) app for field teams working on the Integrated Digital
Monitoring, Evaluation, Accountability and Learning (MEAL) Management
Information System.

Built for intermittent connectivity: participant registrations and survey
responses captured without a network are stored on the device and uploaded when
the enumerator is back online.

All data comes from the REST API in **meal-mis-backend**.

Companion repositories:

- `meal-mis-backend` — NestJS + PostgreSQL API
- `meal-mis-frontend` — React web app

## Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript
- expo-router (file-based navigation, typed routes)
- TanStack Query for server state
- expo-secure-store for tokens (Keychain / Android Keystore)
- AsyncStorage for the offline capture queue

## Quick start

```bash
cp .env.example .env      # point EXPO_PUBLIC_API_URL at the backend
npm install
npm start                 # then press i (iOS), a (Android) or w (web)
```

On a physical device use the machine's LAN IP, not `localhost`:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api/v1
```

The backend must list the app's origin in `CORS_ORIGINS` (Expo web runs on
`http://localhost:8081`; native builds send no `Origin` header and are always
allowed).

| Script | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run ios` / `npm run android` / `npm run web` | start on one platform |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (expo config) |

## Screens

| Route | Purpose |
| --- | --- |
| `/sign-in` | email + password, tokens stored in the device keystore |
| `/(tabs)` → Overview | headline programme figures, reach by region, pending-upload banner |
| `/(tabs)` → Participants | searchable register, tap through to a profile |
| `/(tabs)` → Surveys | active rounds available for collection |
| `/(tabs)` → More | profile, role, per-module access, offline queue, sign out |
| `/participants/new` | registration form with consent capture (offline capable) |
| `/participants/[id]` | profile, enterprise linkage, training history |
| `/surveys/[id]` | response capture against the round's question set (offline capable) |
| `/sync` | review, upload or discard what is queued on the device |

## Offline capture

`src/lib/queue.ts` holds the queue. A submission is queued only when the request
fails for connectivity reasons — a rejection from the API (validation, duplicate
participant ID, insufficient permission) is surfaced to the enumerator
immediately instead, so bad data is not silently parked on the device.

Queued items survive app restarts. Syncing replays them in order; anything the
API rejects stays in the queue with the reason attached.

## Authorization

`useAuth().can(module, action)` hides actions the signed-in role may not
perform, and the More tab shows the effective access per module. This is
presentation only — the API enforces roles and organization scoping on every
request.

## Notes

- `src/lib/types.ts` is generated from the database schema; run `npm run gen:types`
  in the backend repo after a migration rather than editing it here.
- `src/lib/permissions.ts` mirrors the API's permission matrix; keep both in step.
- Personal data is handled under Ethiopia's Personal Data Protection
  Proclamation No. 1321/2024: consent is recorded at registration and the
  backend keeps the audit trail.

## Building for stores

```bash
npx expo prebuild        # generate native projects
npx eas build -p android # or -p ios (requires an Expo account)
```

Set `EXPO_PUBLIC_API_URL` to the production API before building; it is inlined
at build time.
