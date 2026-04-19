# Flutter Integration Guide

This guide provides information on the Converge Flutter application.

## Ready-to-build App

A build-ready Flutter app is available at:

- [`mobile/flutter_nrcc`](../../mobile/flutter_nrcc)

To run the app, navigate to the directory and execute the following commands:

```bash
cd mobile/flutter_nrcc
flutter pub get
flutter run --dart-define=Converge_BASE_URL=http://100.110.136.4:3001
```

### Base URL Configuration

- **Android Emulator:** Use `http://100.110.136.4:3001` to connect to the local development server.
- **Physical Device:** Use `http://<your-lan-ip>:3000` where `<your-lan-ip>` is the local IP address of your development machine.

All mobile-specific endpoints are located under the `/api/mobile/v1/` path.

## Pairing Flow

1.  Call `POST /api/mobile/v1/pair/connect` with the Redmine `baseUrl`, `apiKey`, and an optional `deviceName`.
2.  Upon a successful response, save the returned `token` in secure storage.
3.  Include the token in the `Authorization` header for all subsequent API calls (`Authorization: Bearer <token>`).

## Dependencies

The Flutter project requires the following dependencies, which are defined in `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.8.0+1
  flutter_secure_storage: ^9.2.2
```

## Screen Flow

The application includes the following screens:

- **PairScreen:** Handles the initial pairing with a Redmine instance.
- **IssueListScreen:** Displays issues with Material 3 SearchBar, filter chip sorting, favorite toggle, and status-colored leading icons.
- **IssueDetailScreen:** Shows a selected issue with hero header, flattened collapsible sections, skeleton loading, AI insights, time tracking, comments, GitHub links, relations, and attachment viewing.

## Issue Model

The `Issue` model returned by mobile endpoints has the following key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Prisma cuid (unique identifier) |
| `redmineIssueId` | `int?` | Redmine issue number (nullable for local-only issues) |
| `redmineBaseUrl` | `String?` | Redmine instance URL (nullable for local-only issues) |
| `source` | `String` | `"redmine"` or `"local"` |
| `localIssueNumber` | `int?` | Auto-incremented per-user number for local issues |
| `subject` | `String` | Issue title |
| `statusName` | `String` | Current status name |
| `priority` | `String?` | Priority name |
| `assignedToName` | `String?` | Assigned user name |
| `projectName` | `String?` | Project name |
| `isFavorited` | `bool` | Whether the issue is favorited by the user |

**Important:** `redmineIssueId` is nullable. Local-only issues have `source: "local"`, `redmineIssueId: null`, and `localIssueNumber` set. In the UI, local issues display as `L5` while Redmine issues show `#123`.

## Mobile Endpoint Coverage

The Flutter app can use the following mobile routes:

- `GET /api/mobile/v1/issues` with `searchMode=local|hybrid` for cache-first or hybrid search.
- `GET /api/mobile/v1/issues/[id]` for enriched issue details (`attachments`, `relations`, `allowedStatuses`, `children`). **`[id]` accepts both integer Redmine IDs and string cuids** for local-only issues.
- `POST /api/mobile/v1/issues/[id]/comment` for issue notes.
- `GET|POST|DELETE /api/mobile/v1/issues/[id]/github-links...` for GitHub references.
- `GET|POST /api/mobile/v1/issues/[id]/attachments` and `GET /api/mobile/v1/issues/[id]/attachments/[attachmentId]` for attachment flows.
- `POST /api/mobile/v1/issues/[id]/relations` and `DELETE /api/mobile/v1/issues/[id]/relations/[relationId]` for relation flows.

**Note:** Local-only issues (`source: "local"`) cannot be synced to Redmine. Time entry updates, status changes, and comments on local issues are blocked at the route level.

## API Client

The `NrccApiClient` class in `lib/src/nrcc_api_client.dart` provides typed methods for all mobile endpoints. All issue-related methods accept a `String issueId` parameter (not `int`) to support both Redmine numeric IDs and local issue cuids:

```dart
Future<Issue> getIssue(String issueId) async { ... }
Future<void> postComment({required String issueId, required String comment}) async { ... }
Future<List<TimeEntry>> listTimeEntries({required String issueId}) async { ... }
// ... and more
```

## Notes

- Attachment uploads are multipart (`file`, optional `description`) and currently capped at 10MB.
- Attachment downloads are proxied by Converge so the Redmine API key is never exposed to mobile clients.

## Session Management

- If an API call returns a `401 Unauthorized` error, the stored token should be cleared, and the user should be navigated back to the `PairScreen`.
- **Token Rotation:** Use `POST /api/mobile/v1/tokens/rotate` to rotate the authentication token.
- **Logout:** Use `DELETE /api/mobile/v1/tokens/current` to log out and revoke the current token.
- The Redmine API key should only be held in memory during the pairing process and should not be persisted.
