# Android Integration Guide

This guide provides a ready-to-copy Android client setup for NRCC mobile APIs.

If you are using Flutter (no Xcode, Android SDK only), use the primary guide:

- [Flutter Integration Guide](./flutter-integration.md)

## Base URL

- Local emulator: `http://10.0.2.2:3000`
- Physical device on same network: `http://<your-lan-ip>:3000`

All mobile endpoints are under:

- `/api/mobile/v1/*`

## Pairing Flow

1. Call `POST /api/mobile/v1/pair/connect` with:
   - `baseUrl` (Redmine URL)
   - `apiKey` (Redmine API key)
   - optional `deviceName`
2. Save returned `token` in encrypted storage.
3. Send `Authorization: Bearer <token>` for all future calls.

## Retrofit Starter Files

Use the Kotlin starter files in [docs/android](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android):

- [NrccApi.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/NrccApi.kt)
- [Models.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/Models.kt)
- [AuthTokenStore.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/AuthTokenStore.kt)
- [AuthInterceptor.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/AuthInterceptor.kt)
- [NrccRepositories.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/NrccRepositories.kt)
- [NetworkModule.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/NetworkModule.kt)
- [ViewModels.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/ViewModels.kt)
- [ComposeScreens.kt](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/docs/android/ComposeScreens.kt)

## Required Android Dependencies

```kotlin
implementation("com.squareup.retrofit2:retrofit:2.11.0")
implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
implementation("androidx.security:security-crypto:1.1.0-alpha06")
```

## Notes

- On `401`, clear local token and send user back to pairing screen.
- Use `POST /api/mobile/v1/tokens/rotate` for token rotation.
- Use `DELETE /api/mobile/v1/tokens/current` for logout.
- Keep Redmine API key only in memory during pairing; do not persist it.

## Compose Screen Flow (Starter)

The provided Compose starter includes:

- `PairScreen`: collect Redmine URL + API key + device name and pair.
- `IssueListScreen`: load and render assigned issues.
- `IssueDetailScreen`: view details, post comment, add/remove GitHub links.

Wire these screens via Navigation Compose in your app module and use:

- `PairViewModel` for pairing
- `IssuesViewModel` for list
- `IssueDetailViewModel` for details/actions
