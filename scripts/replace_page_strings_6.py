import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Analytics
    content = content.replace(
        '<h2>📊 Analytics Dashboard</h2>',
        '<h2>{t(\'analytics.title\')}</h2>'
    )
    content = content.replace(
        '<p className="muted">Issue trends and workload distribution</p>',
        '<p className="muted">{t(\'analytics.desc\')}</p>'
    )

    # Missed kickers and titles
    content = content.replace(
        '<p className="kicker">Operations</p>',
        '<p className="kicker">{t(\'login.kickerOps\')}</p>'
    )
    content = content.replace(
        '<p className="kicker">Operations Hub</p>',
        '<p className="kicker">{t(\'hero.kicker\')}</p>'
    )
    content = content.replace(
        '<h1 className="hero-title">Converge</h1>',
        '<h1 className="hero-title">{t(\'hero.title\')}</h1>'
    )
    
    # Page Title
    content = content.replace(
        'Document Title (this usually happens in layout but sometimes code)',
        '' # dummy
    )

    # Metric labels in <p> labels instead of span
    content = content.replace(
        '<p className="metric-label">Open</p>',
        '<p className="metric-label">{t(\'metrics.openLabel\')}</p>'
    )
    content = content.replace(
        '<p className="metric-label">Risk Bucket</p>',
        '<p className="metric-label">{t(\'metrics.riskBucketLabel\')}</p>'
    )
    content = content.replace(
        '<p className="metric-label">Delivery Health</p>',
        '<p className="metric-label">{t(\'metrics.deliveryHealthLabel\')}</p>'
    )
    content = content.replace(
        '<p className="metric-label">Blocked</p>',
        '<p className="metric-label">{t(\'metrics.blockedLabel\')}</p>'
    )
    content = content.replace(
        '<p className="metric-label">Stale Queue</p>',
        '<p className="metric-label">{t(\'metrics.staleQueueLabel\')}</p>'
    )
    content = content.replace(
        '<p className="metric-label">AI Insights</p>',
        '<p className="metric-label">{t(\'metrics.aiInsightsLabel\')}</p>'
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements 6")
