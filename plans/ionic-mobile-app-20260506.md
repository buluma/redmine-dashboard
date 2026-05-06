# Implementation Plan: Ionic Mobile Application

## Approach
Build a modern, cross-platform mobile application using **Ionic React** and **Capacitor**. 

- **Why this solution**: Leveraging React 19 (used in the main dashboard) ensures maximum code/type reuse (especially Zod schemas). Ionic provides a robust component library, and Capacitor handles the native bridge better than Cordova.
- **Alternatives considered**: 
  - **Flutter**: Existing implementation is broken and requires Dart knowledge.
  - **Ionic Angular**: Not consistent with the project's React-based core.
  - **React Native**: Steeper learning curve for web-focused dashboard developers.

## Steps

### 1. Scaffold Project (10 min)
Initialize the Ionic React project using Vite.
```bash
cd mobile
npx -y @ionic/cli start ionic sidemenu --type=react --capacitor --package-id=com.redmine.dashboard
```

### 2. Configure Environment & API Client (20 min)
- **Environment**: Setup `.env` for API base URL.
- **Client**: Create `src/lib/api-client.ts`.
- **Types**: Import/copy relevant Zod schemas from `src/lib/schemas.ts`.

```typescript
// Sample API client structure
import axios from 'axios';
const api = axios.create({ baseURL: process.env.VITE_API_URL });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mrt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### 3. Implement Pairing Flow (30 min)
- **Screen**: `src/pages/Pairing.tsx`.
- **Logic**: Hit `POST /api/mobile/v1/pair/connect`, validate with `mobilePairConnectSchema`, store `token` securely.

### 4. Implement Issue Management (45 min)
- **List View**: `src/pages/IssueList.tsx` with search and filtering.
- **Detail View**: `src/pages/IssueDetail.tsx` with sections for comments, time logs, and AI summaries.

### 5. Integration (15 min)
- Update root `package.json` with workspace scripts:
  - `"ionic:dev": "npm run dev --prefix mobile/ionic"`
  - `"ionic:build": "npm run build --prefix mobile/ionic"`

### 6. Testing (30 min)
- **Unit Tests**: Test the API client and data normalization.
- **E2E**: Basic pairing and listing smoke tests.

## Timeline
| Phase | Duration |
|-------|----------|
| Scaffolding | 10 min |
| API Client | 20 min |
| Pairing Flow | 30 min |
| Issue UI | 45 min |
| Integration | 15 min |
| Testing | 30 min |
| **Total** | **~2.5 hours** |

## Rollback Plan
1. Delete `mobile/ionic` folder.
2. Remove added scripts from root `package.json`.

## Security Checklist
- [x] Secure storage for Bearer tokens (Capacitor Preferences).
- [x] Zod validation for all API inputs/outputs.
- [x] HTTPS enforced for production endpoints.
- [x] Redmine API keys never persisted (only used during pairing).
