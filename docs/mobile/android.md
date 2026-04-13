# Android Integration Guide

This guide provides information for developers working with the native Android client for Converge.

## Base URL Configuration

- **Android Emulator:** Use `http://100.100.245.3:3000` to connect to the local development server running on the host machine.
- **Physical Device:** If using a physical device for testing, ensure it is on the same network as the development machine and use `http://<your-lan-ip>:3000`, replacing `<your-lan-ip>` with the local IP address of your machine.

All mobile-specific endpoints are located under the `/api/mobile/v1/` path.

## Pairing Flow

1.  To pair the mobile client, send a `POST` request to `/api/mobile/v1/pair/connect`. The request body should include the Redmine `baseUrl`, the `apiKey`, and an optional `deviceName`.
2.  On a successful response, the server will return a token. This token should be saved in encrypted storage on the device.
3.  For all subsequent API calls, include the token in the `Authorization` header as a Bearer token (`Authorization: Bearer <token>`).

## Dependencies

The native Android client uses the following core dependencies for networking and security:

```kotlin
implementation("com.squareup.retrofit2:retrofit:2.11.0")
implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
implementation("androidx.security:security-crypto:1.1.0-alpha06")
```

## Session Management

- If the server responds with a `401 Unauthorized` status, the client should clear the locally stored token and navigate the user back to the pairing screen.
- **Token Rotation:** The authentication token can be rotated by sending a `POST` request to `/api/mobile/v1/tokens/rotate`.
- **Logout:** To log out, send a `DELETE` request to `/api/mobile/v1/tokens/current`, which will revoke the token.
- **API Key Handling:** The Redmine API key should only be held in memory during the pairing process and should not be persisted to storage.

## Screen Flow (Jetpack Compose)

The starter example for Jetpack Compose includes the following screens:

- **PairScreen:** A screen to collect the Redmine URL, API key, and an optional device name to pair with the server.
- **IssueListScreen:** A screen that loads and displays the list of assigned issues.
- **IssueDetailScreen:** A screen to view issue details, post comments, and manage GitHub links, relations, and attachments.

## Endpoint Coverage

Recommended endpoint set for native Android parity:

- `GET /api/mobile/v1/issues` with optional `searchMode=local|hybrid`, `scope`, and `openOnly`.
- `GET /api/mobile/v1/issues/[id]` (includes `attachments`, `relations`, `allowedStatuses`, `children`).
- `POST /api/mobile/v1/issues/[id]/comment`.
- `GET|POST|DELETE /api/mobile/v1/issues/[id]/github-links...`.
- `GET|POST /api/mobile/v1/issues/[id]/attachments` and `GET /api/mobile/v1/issues/[id]/attachments/[attachmentId]`.
- `POST /api/mobile/v1/issues/[id]/relations` and `DELETE /api/mobile/v1/issues/[id]/relations/[relationId]`.
