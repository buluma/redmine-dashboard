# Flutter Integration Guide

This is the primary mobile starter for NRCC when you are using Flutter + Android SDK.

## Ready-to-build App

A build-ready Flutter app is available at:

- [`mobile/flutter_nrcc`](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/mobile/flutter_nrcc)

Run it with:

```bash
cd mobile/flutter_nrcc
flutter pub get
flutter run --dart-define=NRCC_BASE_URL=http://10.0.2.2:3000
```

## Base URL

- Android emulator: `http://10.0.2.2:3000`
- Physical device on same network: `http://<your-lan-ip>:3000`

All mobile endpoints are under:

- `/api/mobile/v1/*`

## Pairing Flow

1. Call `POST /api/mobile/v1/pair/connect` with:
   - `baseUrl` (Redmine URL)
   - `apiKey` (Redmine API key)
   - optional `deviceName`
2. Save returned token in secure storage.
3. Send `Authorization: Bearer <token>` on all mobile API calls.

## Flutter Starter Files

Use these files from [docs/flutter](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter):

- [models.dart](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter/models.dart)
- [nrcc_api_client.dart](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter/nrcc_api_client.dart)
- [token_store.dart](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter/token_store.dart)
- [repositories.dart](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter/repositories.dart)
- [screens.dart](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/flutter/screens.dart)

## pubspec dependencies

```yaml
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.8.0+1
  flutter_secure_storage: ^9.2.2
```

## Starter Screen Flow

- `PairScreen`: Redmine URL/API key/device name -> pairing
- `IssueListScreen`: load assigned issues
- `IssueDetailScreen`: view issue, post comment, add/remove GitHub links

## Notes

- On `401`, clear stored token and route back to pair screen.
- Rotate token with `POST /api/mobile/v1/tokens/rotate`.
- Logout/revoke with `DELETE /api/mobile/v1/tokens/current`.
- Do not persist Redmine API key beyond pairing request.
