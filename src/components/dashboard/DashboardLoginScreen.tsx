"use client";

import { useI18n } from "@/src/components/I18nProvider";
import type { BootstrapInfo } from "@/src/types/dashboard";

interface DashboardLoginScreenProps {
  baseUrl: string;
  apiKey: string;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  loading: boolean;
  bootstrapInfo: BootstrapInfo;
  bootstrapBusy: boolean;
  onBootstrapFromEnv: () => void;
  error: string | null;
}

export function DashboardLoginScreen({
  baseUrl,
  apiKey,
  onBaseUrlChange,
  onApiKeyChange,
  onSubmit,
  loading,
  bootstrapInfo,
  bootstrapBusy,
  onBootstrapFromEnv,
  error,
}: DashboardLoginScreenProps) {
  const { t } = useI18n();

  return (
    <main className="dashboard auth-shell">
      <section className="card auth-panel">
        <div className="auth-grid">
          <div>
            <p className="kicker">{t('login.kickerOps')}</p>
            <h1>{t('login.missionControl')}</h1>
            <p className="muted">
              {t('login.connectRedmineDescription')}
            </p>
          </div>
          <form className="form" onSubmit={onSubmit}>
            <label>
              {t('login.baseUrlLabel')}
              <input
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder={t('login.baseUrlPlaceholder')}
                required
              />
            </label>
            <label>
              {t('login.apiKeyLabel')}
              <input
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={t('login.apiKeyPlaceholder')}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? t('login.connecting') : t('login.launchDashboard')}
            </button>
            {bootstrapInfo?.configured && (
              <button
                type="button"
                className="secondary-button"
                onClick={onBootstrapFromEnv}
                disabled={bootstrapBusy || !bootstrapInfo.canBootstrap}
              >
                {bootstrapBusy ? t('login.usingEnv') : t('login.useEnvConfig')}
              </button>
            )}
            {bootstrapInfo?.configured && !bootstrapInfo.canBootstrap && (
              <p className="muted">
                {t('login.envBootstrapHelp', { activeCredentials: bootstrapInfo.activeCredentials })}.
              </p>
            )}
          </form>
        </div>
        {error && <p className="error-banner">{error}</p>}
      </section>
    </main>
  );
}
