import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Sort & Filters
    content = content.replace(
        '<option value="updated_desc">Activity (Newest)</option>',
        '<option value="updated_desc">{t(\'filters.sortNewest\')}</option>'
    )
    content = content.replace(
        '<option value="updated_asc">Activity (Oldest)</option>',
        '<option value="updated_asc">{t(\'filters.sortOldest\')}</option>'
    )
    content = content.replace(
        '<option value="priority">Priority</option>',
        '<option value="priority">{t(\'filters.sortPriority\')}</option>'
    )
    content = content.replace(
        '<option value="due_date">Due Date</option>',
        '<option value="due_date">{t(\'filters.sortDueDate\')}</option>'
    )
    
    # Insights
    content = content.replace(
        '<h3>Status Mix</h3>',
        '<h3>{t(\'insights.statusMixTitle\')}</h3>'
    )
    content = content.replace(
        '<p className="panel-desc">Click a status to filter quickly.</p>',
        '<p className="panel-desc">{t(\'insights.statusMixDesc\')}</p>'
    )
    content = content.replace(
        '<p className="empty-state">No status data yet.</p>',
        '<p className="empty-state">{t(\'insights.noStatusData\')}</p>'
    )
    content = content.replace(
        '<h3>Priority Mix</h3>',
        '<h3>{t(\'insights.priorityMixTitle\')}</h3>'
    )
    content = content.replace(
        '<p className="empty-state">No priority data yet.</p>',
        '<p className="empty-state">{t(\'insights.noPriorityData\')}</p>'
    )
    
    # Search
    content = content.replace(
        'placeholder="Subject, description, assignee"',
        'placeholder={t(\'filters.searchPlaceholder\')}'
    )
    content = content.replace(
        '<label>Search Source</label>',
        '<label>{t(\'filters.searchSource\')}</label>'
    )
    content = content.replace(
        '<option value="local_cache">Local Cache</option>',
        '<option value="local_cache">{t(\'filters.sourceLocal\')}</option>'
    )
    content = content.replace(
        '<option value="hybrid">Hybrid (Redmine + Cache)</option>',
        '<option value="hybrid">{t(\'filters.sourceHybrid\')}</option>'
    )
    content = content.replace(
        '<option value="fts">Full-text Search (DB)</option>',
        '<option value="fts">{t(\'filters.sourceFts\')}</option>'
    )

    # Queue
    content = content.replace(
        '>Clear Selection</button>',
        '>{t(\'queue.clearSelection\')}</button>'
    )
    content = content.replace(
        '>Apply to Selected</button>',
        '>{t(\'queue.applySelected\')}</button>'
    )
    # Be careful with presets and new issue
    content = content.replace(
        '<span>Presets</span>',
        '<span>{t(\'queue.presets\')}</span>'
    )
    content = content.replace(
        '<span>+ New Issue</span>',
        '<span>{t(\'queue.newIssue\')}</span>'
    )
    content = content.replace(
        '★ Favorites',
        '{t(\'queue.favoritesOn\')}'
    )
    content = content.replace(
        '☆ Favorites',
        '{t(\'queue.favoritesOff\')}'
    )
    content = content.replace(
        '<th>ID</th>',
        '<th>{t(\'queue.colId\')}</th>'
    )
    content = content.replace(
        '<th>Subject</th>',
        '<th>{t(\'queue.colSubject\')}</th>'
    )
    content = content.replace(
        '<th>Status</th>',
        '<th>{t(\'queue.colStatus\')}</th>'
    )
    content = content.replace(
        '<th>Priority</th>',
        '<th>{t(\'queue.colPriority\')}</th>'
    )
    content = content.replace(
        '<th>Due</th>',
        '<th>{t(\'queue.colDue\')}</th>'
    )
    content = content.replace(
        '<th>Progress</th>',
        '<th>{t(\'queue.colProgress\')}</th>'
    )
    content = content.replace(
        '<th>Activity</th>',
        '<th>{t(\'queue.colActivity\')}</th>'
    )
    
    # View toggles
    content = content.replace(
        '📑 List',
        '{t(\'queue.viewList\')}'
    )
    content = content.replace(
        '🗂 Board',
        '{t(\'queue.viewBoard\')}'
    )
    content = content.replace(
        '📈 Gantt',
        '{t(\'queue.viewGantt\')}'
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements 3")
