import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Clean up missed headers and options
    content = content.replace(
        '<option value="">All Statuses</option>',
        '<option value="">{t(\'filters.allStatuses\')}</option>'
    )
    content = content.replace(
        '<option value="">All Priorities</option>',
        '<option value="">{t(\'filters.allPriorities\')}</option>'
    )
    content = content.replace(
        '<h2>Status Mix</h2>',
        '<h2>{t(\'insights.statusMixTitle\')}</h2>'
    )
    content = content.replace(
        '<h2>Priority Mix</h2>',
        '<h2>{t(\'insights.priorityMixTitle\')}</h2>'
    )
    content = content.replace(
        '<h2>Ops Alerts</h2>',
        '<h2>{t(\'opsAlerts.title\')}</h2>'
    )
    content = content.replace(
        '<h2>Issue Queue</h2>',
        '<h2>{t(\'queue.title\')}</h2>'
    )
    content = content.replace(
        '<option value="">Presets</option>',
        '<option value="">{t(\'queue.presets\')}</option>'
    )
    
    # Ops Alert items count
    content = content.replace(
        '<div className="panel-footer">{visibleAlerts.length} alert item(s).</div>',
        '<div className="panel-footer">{t(\'opsAlerts.itemCount\', { count: visibleAlerts.length })}</div>'
    )
    
    # Activity Feed
    content = content.replace(
        '<h2>Recent Activity Feed</h2>',
        '<h2>{t(\'activityFeed.title\')}</h2>'
    )
    content = content.replace(
        'Last {feedLimit} events from updates, comments, and timelogs.',
        '{t(\'activityFeed.desc\', { count: feedLimit })}'
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements 5")
