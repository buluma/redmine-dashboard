# Converge-Compose Android MVP

Standalone native Android client for Converge, branded as `Converge-Compose` because it is built with Kotlin + Jetpack Compose. This project is intentionally separate from `mobile/converge` so the existing Flutter app stays untouched.

## MVP Scope

- Pair a device with Converge using Redmine base URL + Redmine API key.
- Store the returned Converge mobile bearer token in encrypted device storage.
- Rotate/revoke the mobile bearer token.
- List assigned/open issues through `/api/mobile/v1/issues`.
- Search issues using the mobile API local cache search mode.
- Create Redmine issues from the mobile client.
- Open issue detail.
- Post comments to Redmine-backed issues.
- Update issue status using a Material bottom sheet backed by `allowedStatuses`.
- Render issue descriptions with CommonMark support for headings, emphasis, links, lists, inline code, and fenced code blocks.
- Toggle favorites.
- Edit issue subject, description, priority name, dates, and estimates.
- Assign issues using the mobile assignable-users endpoint.
- Log and delete time entries.
- Add and view internal notes.
- Add, open, and remove GitHub links.
- Run AI summarize and categorize actions when enabled on the Converge server.
- Show child issues, attachments, relations, GitHub links, and time-entry counts/details where the mobile API provides them.
- Refresh issue list/detail.
- Revoke the current token on logout.

## Build

```bash
cd mobile/android-native
./gradlew assembleDebug
```

The default emulator server URL is `http://10.0.2.2:3000`. Use your computer LAN IP when testing from a physical Android device, for example `http://10.0.0.104:3001` when the dev server is listening on port `3001`.

For local development, the app permits cleartext `http://` traffic through `network_security_config.xml`. Use HTTPS before shipping a production build.

## Notes

- Local-only issues can be viewed, but comments/status changes are blocked in the MVP because those operations do not sync to Redmine.
- Attachments, GitHub links, relations, time entries, offline cache, and push notifications are intentionally deferred from this first native build.
