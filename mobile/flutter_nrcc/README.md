# NRCC Flutter App

Build-ready Flutter Android client for NRCC mobile APIs.

## Prerequisites

- Flutter SDK
- Android SDK / emulator

## Configure NRCC Base URL

By default the app targets Android emulator loopback:

- `http://10.0.2.2:3000`

Override at run time:

```bash
flutter run --dart-define=NRCC_BASE_URL=http://10.0.2.2:3000
```

For physical device, use your machine LAN IP:

```bash
flutter run --dart-define=NRCC_BASE_URL=http://192.168.1.50:3000
```

## Run

```bash
flutter pub get
flutter run
```

## App Flow

1. Pair with Redmine URL/API key
2. View assigned issues
3. Open issue details
4. Post comment
5. Add/remove GitHub links

## Notes

- Android cleartext traffic is enabled for local HTTP development.
- On `401` responses, token is cleared and app requires re-pair.
