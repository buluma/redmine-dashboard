import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Import
    content = content.replace(
        'import { AllowedStatusView } from "@/src/lib/issue-shape";',
        'import { AllowedStatusView } from "@/src/lib/issue-shape";\nimport { useI18n } from "@/src/components/I18nProvider";'
    )
    
    # Hook
    content = content.replace(
        'export default function Home() {\n  const router = useRouter();',
        'export default function Home() {\n  const router = useRouter();\n  const { t } = useI18n();'
    )
    
    # Login View
    content = content.replace(
        '<span className="kicker">Operations</span>',
        '<span className="kicker">{t(\'login.kickerOps\')}</span>'
    )
    content = content.replace(
        '<h1>Mission Control Dashboard</h1>',
        '<h1>{t(\'login.missionControl\')}</h1>'
    )
    content = content.replace(
        '<p className="subtitle">Connect your Redmine account and manage issues from one unified dashboard.</p>',
        '<p className="subtitle">{t(\'login.connectDesc\')}</p>'
    )
    content = content.replace(
        '<label>Base URL</label>',
        '<label>{t(\'login.baseUrlLabel\')}</label>'
    )
    content = content.replace(
        '<label>API Key</label>',
        '<label>{t(\'login.apiKeyLabel\')}</label>'
    )
    content = content.replace(
        'placeholder="https://redmine.example.com"',
        'placeholder={t(\'login.baseUrlPlaceholder\')}'
    )
    content = content.replace(
        'placeholder="your-redmine-api-key"',
        'placeholder={t(\'login.apiKeyPlaceholder\')}'
    )
    content = content.replace(
        '<span className="button-text">Connecting...</span>',
        '<span className="button-text">{t(\'login.connecting\')}</span>'
    )
    content = content.replace(
        '<span className="button-text">Launch Dashboard</span>',
        '<span className="button-text">{t(\'login.launchDashboard\')}</span>'
    )
    content = content.replace(
        '<span className="button-text">Using .env...</span>',
        '<span className="button-text">{t(\'login.usingEnv\')}</span>'
    )
    content = content.replace(
        '<span className="button-text">Use .env Configuration</span>',
        '<span className="button-text">{t(\'login.useEnvConfig\')}</span>'
    )
    content = content.replace(
        '.env bootstrap is available only on first run (active credentials',
        '{t(\'login.envBootstrapHelp\', { activeCredentials: String(authStore.getCredentials()?.type) })}'
    )

    # Hero / Header
    content = content.replace(
        '<span className="kicker">Operations Hub</span>',
        '<span className="kicker">{t(\'hero.kicker\')}</span>'
    )
    content = content.replace(
        '<h1 className="title">Converge</h1>',
        '<h1 className="title">{t(\'hero.title\')}</h1>'
    )
    content = content.replace(
        '>Signed in as {user.firstname} {user.lastname} ({user.login})</div>',
        '>{t(\'hero.signedInAs\', { displayName: user.firstname + " " + user.lastname, username: user.login })}</div>'
    )
    content = content.replace(
        '>Sync: {syncState.status}</div>',
        '>{t(\'hero.syncStatus\', { status: syncState.status })}</div>'
    )
    content = content.replace(
        '>Waiting for first sync</div>',
        '>{t(\'hero.syncWaiting\')}</div>'
    )
    content = content.replace(
        '>Last sync error: {syncState.lastError}</div>',
        '>{t(\'hero.syncLastError\', { error: syncState.lastError })}</div>'
    )
    # Be careful with AI things
    content = content.replace(
        '{config.ai.enabled ? "🤖 AI: Cloud" : "🤖 AI: Fallback"}',
        '{config.ai.enabled ? t(\'hero.aiCloud\') : t(\'hero.aiFallback\')}'
    )
    content = content.replace(
        'Refreshing...',
        '{t(\'hero.refreshing\')}'
    )
    content = content.replace(
        'Force Refresh',
        '{t(\'hero.forceRefresh\')}'
    )
    # Filters
    content = content.replace(
        '<span className="label">Reset Filters</span>',
        '<span className="label">{t(\'hero.resetFilters\')}</span>'
    )
    content = content.replace(
        '<span>Shortcuts</span>',
        '<span>{t(\'hero.shortcutsBtn\')}</span>'
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements")
