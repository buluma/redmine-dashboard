import sys

def replace_all(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pagination
    content = content.replace(
        'Page <strong>{safePage}</strong> of <strong>{maxPage}</strong>',
        '{t(\'pagination.pageInfo\', { current: safePage, max: maxPage })}'
    )
    content = content.replace(
        '{" · "}Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredTotal)} of {filteredTotal}',
        '{" · "}{t(\'pagination.showing\', { start: (safePage - 1) * pageSize + 1, end: Math.min(safePage * pageSize, filteredTotal), total: filteredTotal })}'
    )
    content = content.replace(
        '{filteredTotal < total ? ` (filtered from ${total.toLocaleString()})` : ""}',
        '{filteredTotal < total ? t(\'pagination.filtered\', { unfilteredTotal: total.toLocaleString() }) : ""}'
    )
    content = content.replace(
        'Queue hidden. {visibleIssues.length} issue(s) loaded, {selectedIssueIds.length} selected.',
        '{t(\'pagination.queueHidden\', { loadedCount: visibleIssues.length, selectedCount: selectedIssueIds.length })}'
    )

    # Preview
    content = content.replace(
        '<span>Status: {hoveredIssue.statusName}</span>',
        '<span>{t(\'preview.status\', { name: hoveredIssue.statusName })}</span>'
    )
    content = content.replace(
        '<span>Progress: {hoveredIssue.doneRatio ?? 0}%</span>',
        '<span>{t(\'preview.progress\', { ratio: hoveredIssue.doneRatio ?? 0 })}</span>'
    )
    content = content.replace(
        'Due: {new Date(hoveredIssue.dueDate).toLocaleDateString()}',
        '{t(\'preview.due\', { date: new Date(hoveredIssue.dueDate).toLocaleDateString() })}'
    )

    # Drawer Header
    content = content.replace(
        '{selectedIssue.projectName ?? "No Project"}',
        '{selectedIssue.projectName ?? t(\'drawer.noProject\')}'
    )
    content = content.replace(
        '{selectedIssue.priority ?? "No Priority"}',
        '{selectedIssue.priority ?? t(\'drawer.noPriority\')}'
    )
    content = content.replace(
        'Redmine source:',
        '{t(\'drawer.redmineSource\')}'
    )
    content = content.replace(
        'Children: {selectedIssue.children.map((c) => `#${c.id}`).join(", ")}',
        '{t(\'drawer.children\', { ids: selectedIssue.children.map((c) => `#${c.id}`).join(", ") })}'
    )
    content = content.replace(
        '>Close</button>',
        '>{t(\'drawer.close\')}</button>'
    )

    # GitHub Links
    content = content.replace(
        '<h3>GitHub Links</h3>',
        '<h3>{t(\'drawer.ghLinksTitle\')}</h3>'
    )
    content = content.replace(
        'Repository (`owner/repo`)',
        '{t(\'drawer.ghRepo\')}'
    )
    content = content.replace(
        'GitHub Issue #',
        '{t(\'drawer.ghIssueNum\')}'
    )
    content = content.replace(
        'GitHub PR #',
        '{t(\'drawer.ghPrNum\')}'
    )
    content = content.replace(
        'Direct URL (optional)',
        '{t(\'drawer.ghUrl\')}'
    )
    content = content.replace(
        'Title (optional)',
        '{t(\'drawer.ghTitle\')}'
    )
    content = content.replace(
        '{githubBusy ? "Linking..." : "Add GitHub Link"}',
        '{githubBusy ? t(\'drawer.linking\') : t(\'drawer.addGhLink\')}'
    )
    content = content.replace(
        'No GitHub links yet.',
        '{t(\'drawer.noGhLinks\')}'
    )
    content = content.replace(
        '>Remove</button>',
        '>{t(\'drawer.remove\')}</button>'
    )

    # Attachments
    content = content.replace(
        '<h3>Attachments</h3>',
        '<h3>{t(\'drawer.attachmentsTitle\')}</h3>'
    )
    content = content.replace(
        'placeholder="Optional note"',
        'placeholder={t(\'drawer.attachDesc\')}'
    )
    content = content.replace(
        '{attachmentBusy ? "Uploading..." : "Upload Attachment"}',
        '{attachmentBusy ? t(\'drawer.uploading\') : t(\'drawer.uploadAttach\')}'
    )
    content = content.replace(
        'No attachments yet.',
        '{t(\'drawer.noAttach\')}'
    )
    content = content.replace(
        '{attachment.author ?? "Unknown author"}',
        '{attachment.author ?? t(\'drawer.unknownAuthor\')}'
    )
    content = content.replace(
        'title={`Preview ${attachment.filename}`}',
        'title={t(\'drawer.previewMsg\', { filename: attachment.filename })}'
    )

    # Relations
    content = content.replace(
        '<h3>Relations</h3>',
        '<h3>{t(\'drawer.relationsTitle\')}</h3>'
    )
    content = content.replace(
        'Issue #',
        '{t(\'drawer.relIssueId\')}'
    )
    content = content.replace(
        'Type',
        '{t(\'drawer.relType\')}'
    )
    content = content.replace(
        'Delay (optional)',
        '{t(\'drawer.relDelay\')}'
    )
    content = content.replace(
        '{relBusy ? "Saving..." : "Add Relation"}',
        '{relBusy ? t(\'drawer.saving\') : t(\'drawer.addRelation\')}'
    )
    content = content.replace(
        'No relations yet.',
        '{t(\'drawer.noRelations\')}'
    )
    content = content.replace(
        'Delay: {rel.delay} day(s)',
        '{t(\'drawer.delayDays\', { count: rel.delay })}'
    )

    # Description & Comments
    content = content.replace(
        '<h3>Description</h3>',
        '<h3>{t(\'drawer.descTitle\')}</h3>'
    )
    content = content.replace(
        '<h3>Comments</h3>',
        '<h3>{t(\'drawer.commentsTitle\')}</h3>'
    )
    content = content.replace(
        'placeholder="Share an update"',
        'placeholder={t(\'drawer.shareUpdate\')}'
    )
    content = content.replace(
        '{commentBusy ? "Saving..." : "Post Comment"}',
        '{commentBusy ? t(\'drawer.saving\') : t(\'drawer.postComment\')}'
    )
    content = content.replace(
        'No comments yet.',
        '{t(\'drawer.noComments\')}'
    )

    # Time Logs
    content = content.replace(
        '<h3>Time Logs</h3>',
        '<h3>{t(\'drawer.timeLogsTitle\')}</h3>'
    )
    content = content.replace(
        'Start Timer',
        '{t(\'drawer.startTimer\')}'
    )
    content = content.replace(
        'Running: {formatTime(timerSeconds)}',
        '{t(\'drawer.runningTime\', { time: formatTime(timerSeconds) })}'
    )
    content = content.replace(
        'Stop and Fill Hours',
        '{t(\'drawer.stopFill\')}'
    )
    content = content.replace(
        'Timer is currently running on issue #{timerIssueId}.',
        '{t(\'drawer.timerRunningInfo\', { id: timerIssueId })}'
    )
    content = content.replace(
        'Hours',
        '{t(\'drawer.hours\')}'
    )
    content = content.replace(
        'Activity',
        '{t(\'drawer.activity\')}'
    )
    content = content.replace(
        'Date',
        '{t(\'drawer.date\')}'
    )
    content = content.replace(
        'Comment',
        '{t(\'drawer.timeComment\')}'
    )
    content = content.replace(
        'placeholder="Summarize the work"',
        'placeholder={t(\'drawer.timeCommentPlaceholder\')}'
    )
    content = content.replace(
        '{timeLogBusy ? "Saving..." : "Add Time Log"}',
        '{timeLogBusy ? t(\'drawer.saving\') : t(\'drawer.addTimeLog\')}'
    )
    content = content.replace(
        'No time entries yet.',
        '{t(\'drawer.noTimeLogs\')}'
    )
    content = content.replace(
        'Synced from Redmine',
        '{t(\'drawer.syncedFromRedmine\')}'
    )
    content = content.replace(
        'Local entry',
        '{t(\'drawer.localEntry\')}'
    )
    content = content.replace(
        '(no comment)',
        '{t(\'drawer.noTimeComment\')}'
    )

    # Toasts
    content = content.replace(
        'toast.info("Manual full refresh completed.");',
        'toast.info(t(\'toasts.manualPullSuccess\'));'
    )
    content = content.replace(
        'toast.error("Manual pull failed", { description: String(err) });',
        'toast.error(t(\'toasts.manualPullFailed\'), { description: String(err) });'
    )
    content = content.replace(
        'toast.success("Connected using .env configuration.");',
        'toast.success(t(\'toasts.envSuccess\'));'
    )
    # etc etc. I will add more if I miss any.
    # Actually I should be careful not to replace things that aren't there or duplicate.

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_all('app/page.tsx')
print("Done replacements 4")
