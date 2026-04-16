import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Metrics
    content = content.replace(
        '<span className="label">Visible / Total</span>',
        '<span className="label">{t(\'metrics.visibleTotalLabel\')}</span>'
    )
    content = content.replace(
        '>Due Today: {metrics.dueToday}</div>',
        '>{t(\'metrics.dueTodayInfo\', { count: metrics.dueToday })}</div>'
    )
    content = content.replace(
        '>Avg Since Update: {metrics.avgOpenAgeDays}d</div>',
        '>{t(\'metrics.avgOpenAgeInfo\', { days: metrics.avgOpenAgeDays })}</div>'
    )
    content = content.replace(
        '>Open</span>',
        '>{t(\'metrics.openLabel\')}</span>'
    )
    content = content.replace(
        'In progress: {metrics.inProgress}',
        '{t(\'metrics.inProgressFoot\', { count: metrics.inProgress })}'
    )
    content = content.replace(
        '>Risk Bucket</span>',
        '>{t(\'metrics.riskBucketLabel\')}</span>'
    )
    content = content.replace(
        'Overdue issues • Due soon: {metrics.dueSoon}',
        '{t(\'metrics.riskFoot\', { count: metrics.dueSoon })}'
    )
    content = content.replace(
        '>Delivery Health</span>',
        '>{t(\'metrics.deliveryHealthLabel\')}</span>'
    )
    content = content.replace(
        'Done: {metrics.doneCount} • Avg done ratio: {metrics.avgDoneRatio}%',
        '{t(\'metrics.deliveryHealthFoot\', { done: metrics.doneCount, ratio: metrics.avgDoneRatio })}'
    )
    content = content.replace(
        '>Blocked</span>',
        '>{t(\'metrics.blockedLabel\')}</span>'
    )
    content = content.replace(
        'Status contains blocked/hold/waiting',
        '{t(\'metrics.blockedFoot\')}'
    )
    content = content.replace(
        '>Stale Queue</span>',
        '>{t(\'metrics.staleQueueLabel\')}</span>'
    )
    content = content.replace(
        'No visible activity in 3+ days • Avg since activity: {metrics.avgStaleAgeDays}d',
        '{t(\'metrics.staleQueueFoot\', { days: metrics.avgStaleAgeDays })}'
    )
    
    # AI insights count
    content = content.replace(
        '<p>No available AI insights. Check again later!</p>',
        '<p>{t(\'metrics.aiInsightsNone\')}</p>'
    )
    content = content.replace(
        '<p>1 AI insight generated</p>',
        '<p>{t(\'metrics.aiInsightsOne\')}</p>'
    )
    content = content.replace(
        '<p>{metrics.aiInsights} AI insights generated</p>',
        '<p>{t(\'metrics.aiInsightsMany\', { count: metrics.aiInsights })}</p>'
    )
    content = content.replace(
        "className=\"label\">AI Insights</span>",
        "className=\"label\">{t('metrics.aiInsightsLabel')}</span>"
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements 2")
