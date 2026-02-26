# NRCC Flutter App

Build-ready Flutter Android client for NRCC mobile APIs.

## Prerequisites

- Flutter SDK
- Android SDK / emulator

## Configure NRCC Base URL

Use local environment configuration:

```bash
cp .env.example .env
```

Set `NRCC_BASE_URL` in `.env`.

Default value in this project (Tailscale / physical phone):

- `http://100.100.245.3:3000`

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
2. View assigned issues
3. Open issue details
4. Post comment
5. Add/remove GitHub links

## Notes

- Android cleartext traffic is enabled for local HTTP development.
- On `401` responses, token is cleared and app requires re-pair.
