# Converge Flutter App

Build-ready Flutter Android client for Converge mobile APIs.

## Prerequisites

- Flutter SDK
- Android SDK / emulator

## Configure Converge Base URL

Use local environment configuration:

```bash
cp .env.example .env
```

Set `Converge_BASE_URL` in `.env`.

Default value in this project (Tailscale / physical phone):

- `http://100.110.136.4:3001`

Android emulator alternative:

- `http://10.0.2.2:3000`

For physical devices without Tailscale, use your machine LAN IP (example):

- `http://192.168.1.50:3000`

## Configure Sentry (Optional)

Set the following in `.env`:

- `SENTRY_DSN`
- `SENTRY_SEND_DEFAULT_PII`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SENTRY_PROFILES_SAMPLE_RATE`
- `SENTRY_ENABLE_LOGS`

## Run

```bash
flutter pub get
flutter run
```

## App Flow

1. Pair with Redmine URL/API key
2. View issues — search with Material 3 SearchBar, filter by sort/status, toggle favorites
3. Open issue details — hero header with inline badges, collapsible sections
4. Post comment, log time, add GitHub links, manage relations
5. View AI summaries and categorization

## Issue Model

The `Issue` model includes these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Prisma cuid |
| `redmineIssueId` | `int?` | Redmine number (null for local issues) |
| `source` | `String` | `"redmine"` or `"local"` |
| `localIssueNumber` | `int?` | Auto-incremented number for local issues |

Local-only issues (`source: "local"`) display as `L5` vs `#123` for Redmine issues. They cannot be synced to Redmine.

## API Client

All issue-related methods in `NrccApiClient` accept `String issueId` (not `int`) to support both Redmine numeric IDs and local issue cuids:

```dart
Future<Issue> getIssue(String issueId) async { ... }
```

## Notes

- Android cleartext traffic is enabled for local HTTP development.
- On `401` responses, token is cleared and app requires re-pair.
- Build release APK: `flutter build apk --release` → `build/app/outputs/flutter-apk/app-release.apk`
