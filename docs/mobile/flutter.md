# Flutter Integration Guide

This guide provides information on the Converge Flutter application.

## Ready-to-build App

A build-ready Flutter app is available at:

- [`mobile/flutter_nrcc`](../../mobile/flutter_nrcc)

To run the app, navigate to the directory and execute the following commands:

```bash
cd mobile/flutter_nrcc
flutter pub get
flutter run --dart-define=Converge_BASE_URL=http://100.100.245.3:3000
```

### Base URL Configuration

- **Android Emulator:** Use `http://100.100.245.3:3000` to connect to the local development server.
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

The starter application includes the following screens:

- **PairScreen:** Handles the initial pairing with a Redmine instance.
- **IssueListScreen:** Displays the list of issues assigned to the user.
- **IssueDetailScreen:** Shows a selected issue and supports comments, GitHub links, relations, attachment viewing, and allowed-status visibility.

## Mobile Endpoint Coverage

The Flutter app can use the following mobile routes:

- `GET /api/mobile/v1/issues` with `searchMode=local|hybrid` for cache-first or hybrid search.
- `GET /api/mobile/v1/issues/[id]` for enriched issue details (`attachments`, `relations`, `allowedStatuses`, `children`).
- `POST /api/mobile/v1/issues/[id]/comment` for issue notes.
- `GET|POST|DELETE /api/mobile/v1/issues/[id]/github-links...` for GitHub references.
- `GET|POST /api/mobile/v1/issues/[id]/attachments` and `GET /api/mobile/v1/issues/[id]/attachments/[attachmentId]` for attachment flows.
- `POST /api/mobile/v1/issues/[id]/relations` and `DELETE /api/mobile/v1/issues/[id]/relations/[relationId]` for relation flows.

## Notes

- Attachment uploads are multipart (`file`, optional `description`) and currently capped at 10MB.
- Attachment downloads are proxied by Converge so the Redmine API key is never exposed to mobile clients.

## Session Management

- If an API call returns a `401 Unauthorized` error, the stored token should be cleared, and the user should be navigated back to the `PairScreen`.
- **Token Rotation:** Use `POST /api/mobile/v1/tokens/rotate` to rotate the authentication token.
- **Logout:** Use `DELETE /api/mobile/v1/tokens/current` to log out and revoke the current token.
- The Redmine API key should only be held in memory during the pairing process and should not be persisted.
