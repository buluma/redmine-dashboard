package com.converge.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Comment
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MediumTopAppBar
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.converge.mobile.data.AllowedStatus
import com.converge.mobile.data.AssignableUser
import com.converge.mobile.data.GithubLink
import com.converge.mobile.data.InternalNote
import com.converge.mobile.data.Issue
import com.converge.mobile.data.IssueAttachment
import com.converge.mobile.data.IssueRelation
import com.converge.mobile.data.Journal
import com.converge.mobile.data.TimeEntry
import com.converge.mobile.data.displayId
import com.converge.mobile.data.DueUrgency
import com.converge.mobile.data.formatDate
import com.converge.mobile.data.parseDueUrgency
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.MarkdownDescription
import com.converge.mobile.ui.MarkdownImageSource
import com.converge.mobile.ui.components.AssigneeAvatar
import com.converge.mobile.ui.components.ErrorBanner
import com.converge.mobile.ui.components.FactRow
import com.converge.mobile.ui.components.FormDialog
import com.converge.mobile.ui.components.FormTextField
import com.converge.mobile.ui.components.IconText
import com.converge.mobile.ui.components.NeutralPill
import com.converge.mobile.ui.components.PriorityPill
import com.converge.mobile.ui.components.Section
import com.converge.mobile.ui.components.SmallStat
import com.converge.mobile.ui.components.StatusPill
import kotlinx.coroutines.launch
import java.net.URLDecoder

private enum class DetailTab(val label: String) {
    OVERVIEW("Overview"),
    NOTES("Notes"),
    HISTORY("History"),
    TIME("Time"),
    LINKS("Links"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IssueDetailScreen(state: MainUiState, viewModel: MainViewModel) {
    val issue = state.selectedIssue ?: return
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val pagerState = rememberPagerState { DetailTab.entries.size }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    var showStatusSheet by remember { mutableStateOf(false) }
    val statusSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(state.actionMessage) {
        state.actionMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionMessage()
        }
    }

    if (showStatusSheet) {
        StatusBottomSheet(
            issue = issue,
            disabled = state.isLoading,
            sheetState = statusSheetState,
            onDismiss = { showStatusSheet = false },
            onSelect = { status ->
                scope.launch {
                    statusSheetState.hide()
                    showStatusSheet = false
                    viewModel.updateStatus(status.id)
                }
            },
        )
    }
    if (state.showEditIssueDialog) EditIssueDialog(state, viewModel)
    if (state.showTimeDialog) TimeEntryDialog(state, viewModel)
    if (state.showInternalNoteDialog) InternalNoteDialog(state, viewModel)
    if (state.showGithubDialog) GithubLinkDialog(state, viewModel)
    if (state.showRelationDialog) RelationDialog(state, viewModel)
    if (state.showAssignSheet) {
        AssignBottomSheet(
            users = state.assignableUsers,
            disabled = state.isLoading,
            onDismiss = viewModel::hideAssignSheet,
            onSelect = viewModel::assignIssue,
        )
    }

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            MediumTopAppBar(
                title = {
                    Text(issue.subject, maxLines = 2, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = viewModel::backToList) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.selectIssue(issue) }, enabled = !state.isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                scrollBehavior = scrollBehavior,
                colors = TopAppBarDefaults.mediumTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            ErrorBanner(state.errorMessage, viewModel::clearError)
            if (state.isLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            TabRow(selectedTabIndex = pagerState.currentPage) {
                DetailTab.entries.forEachIndexed { index, tab ->
                    Tab(
                        selected = pagerState.currentPage == index,
                        onClick = { scope.launch { pagerState.animateScrollToPage(index) } },
                        text = { Text(tab.label, style = MaterialTheme.typography.labelMedium) },
                    )
                }
            }

            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
                when (DetailTab.entries[page]) {
                    DetailTab.OVERVIEW -> OverviewContent(issue, state, viewModel, onChangeStatus = { showStatusSheet = true })
                    DetailTab.NOTES -> NotesContent(state, viewModel)
                    DetailTab.HISTORY -> HistoryContent(state, viewModel)
                    DetailTab.TIME -> TimeContent(issue, state, viewModel)
                    DetailTab.LINKS -> LinksContent(issue, state, viewModel)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OverviewContent(issue: Issue, state: MainUiState, viewModel: MainViewModel, onChangeStatus: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IssueHero(issue)
        IssueActionGrid(issue, state, viewModel)
        IssueKeyFacts(issue)
        CustomFieldsSection(issue)
        StatusSummary(issue, state.isLoading, onChange = onChangeStatus)

        Section("Description") {
            val description = issue.description?.takeIf { it.isNotBlank() }
            if (description == null) {
                Text("No description provided.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                MarkdownDescription(description, imageResolver = markdownImageResolver(issue, viewModel))
            }
        }

        Section("Comment") {
            if (issue.redmineIssueId == null) {
                Text("Local-only issue — comments cannot sync to Redmine from mobile.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
            }
            OutlinedTextField(
                value = state.commentDraft,
                onValueChange = viewModel::updateCommentDraft,
                label = { Text("Add comment") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = viewModel::postComment,
                enabled = !state.isLoading && issue.redmineIssueId != null && state.commentDraft.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Post Comment")
            }
        }

        AiSection(state)
        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun HistoryContent(state: MainUiState, viewModel: MainViewModel) {
    val issue = state.selectedIssue
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.journals.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text(
                "No Redmine history found.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        } else {
            state.journals.forEach { journal ->
                JournalCard(
                    journal = journal,
                    imageResolver = issue?.let { markdownImageResolver(it, viewModel) },
                )
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun JournalCard(journal: Journal, imageResolver: ((String) -> MarkdownImageSource?)? = null) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                    AssigneeAvatar(journal.author ?: "Unknown")
                    Text(journal.author ?: "Unknown", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                }
                Text(journal.createdOnRemote.formatDate(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val notes = journal.notes?.takeIf { it.isNotBlank() }
            if (notes == null) {
                Text("Field update", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                MarkdownDescription(notes, imageResolver = imageResolver)
            }
        }
    }
}

@Composable
private fun NotesContent(state: MainUiState, viewModel: MainViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Button(onClick = viewModel::openInternalNoteDialog, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Filled.Comment, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Add Internal Note")
        }
        if (state.internalNotes.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("No internal notes yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            state.internalNotes.forEach { note ->
                NoteCard(note, onDelete = { viewModel.deleteInternalNote(note.id) })
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun NoteCard(note: InternalNote, onDelete: (() -> Unit)? = null) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                    AssigneeAvatar(note.authorName)
                    Text(note.authorName, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                    Text(note.createdAt.formatDate(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                onDelete?.let {
                    TextButton(onClick = it) { Text("Delete", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall) }
                }
            }
            Text(note.content, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun TimeContent(issue: Issue, state: MainUiState, viewModel: MainViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Button(
            onClick = viewModel::openTimeDialog,
            enabled = issue.redmineIssueId != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Default.Timer, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Log Time")
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SmallStat("Spent", issue.spentHours?.let { "${it}h" } ?: "—", modifier = Modifier.weight(1f))
            SmallStat("Estimate", issue.estimatedHours?.let { "${it}h" } ?: "—", modifier = Modifier.weight(1f))
        }

        if (issue.timeEntries.isEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text("No time entries.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            issue.timeEntries.forEach { entry ->
                TimeEntryCard(
                    entry = entry,
                    onEdit = entry.redmineTimeEntryId?.let { { viewModel.openEditTimeEntry(entry) } },
                    onDelete = entry.redmineTimeEntryId?.let { id -> { viewModel.deleteTimeEntry(id) } },
                )
            }
        }
        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun TimeEntryCard(entry: TimeEntry, onEdit: (() -> Unit)?, onDelete: (() -> Unit)?) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${entry.hours}h — ${entry.activityName ?: "Activity"}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text("${entry.spentOn}${entry.comments?.let { "  ·  $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                onEdit?.let {
                    TextButton(onClick = it) { Text("Edit") }
                }
                onDelete?.let {
                    TextButton(onClick = it) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
}

@Composable
private fun LinksContent(issue: Issue, state: MainUiState, viewModel: MainViewModel) {
    val uriHandler = LocalUriHandler.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Section("Hierarchy") {
            Button(
                onClick = viewModel::openRelationDialog,
                enabled = issue.redmineIssueId != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.AccountTree, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Add Relation")
            }
            issue.parentIssueId?.let { parentId ->
                TextButton(onClick = { viewModel.selectIssueById(parentId) }) {
                    Text("Parent #$parentId ${issue.parentIssueLabel ?: ""}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (issue.children.isNotEmpty()) {
                Text("Children", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                issue.children.forEach { child ->
                    TextButton(onClick = { viewModel.selectIssueById(child.id) }) {
                        Text("#${child.id} ${child.subject}", maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            if (issue.relations.isEmpty()) {
                Text("No issue relations.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("Relations", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                issue.relations.forEach { relation ->
                    RelationRow(
                        relation = relation,
                        onOpen = { viewModel.selectIssueById(relation.targetIssueId) },
                        onDelete = { viewModel.deleteRelation(relation) },
                    )
                }
            }
        }

        Section("GitHub Links") {
            Button(
                onClick = viewModel::openGithubDialog,
                enabled = issue.redmineIssueId != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Link, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Add GitHub Link")
            }
            if (issue.githubLinks.isEmpty()) {
                Text("No GitHub links.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            issue.githubLinks.forEach { link ->
                GithubLinkRow(link, onOpen = { uriHandler.openUri(link.url) }, onRemove = { viewModel.removeGithubLink(link.id) })
            }
        }

        if (issue.attachments.isNotEmpty()) {
            Section("Attachments") {
                issue.attachments.forEach { attachment ->
                    AttachmentRow(attachment, onDownload = { viewModel.downloadAttachment(attachment) })
                }
            }
        }

        Section("Stats") {
            FactRow(Icons.Default.Link, "GitHub", issue.githubLinks.size.toString())
            FactRow(Icons.Default.AttachFile, "Attachments", issue.attachments.size.toString())
            FactRow(Icons.Default.AccountTree, "Relations", issue.relations.size.toString())
            FactRow(Icons.Default.Timer, "Time entries", issue.timeEntries.size.toString())
        }

        Spacer(Modifier.height(80.dp))
    }
}

@Composable
private fun RelationRow(relation: IssueRelation, onOpen: () -> Unit, onDelete: () -> Unit) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("${relation.relationType} #${relation.targetIssueId}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                relation.delay?.let { Text("Delay: $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            TextButton(onClick = onOpen) { Text("Open") }
            IconButton(onClick = onDelete, enabled = relation.redmineRelationId > 0) {
                Icon(Icons.Default.Delete, contentDescription = "Remove relation", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun AttachmentRow(attachment: IssueAttachment, onDownload: () -> Unit) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onDownload),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(attachment.filename, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${attachment.filesize / 1024} KB${attachment.contentType?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = onDownload) { Text("Download") }
        }
    }
}

private fun markdownImageResolver(issue: Issue, viewModel: MainViewModel): (String) -> MarkdownImageSource? = { destination ->
    val cleanDestination = destination.trim().trim('<', '>')
    val attachment = issue.attachments.firstOrNull { attachment ->
        isImageAttachment(attachment) && attachmentMatchesDestination(attachment, cleanDestination)
    }
    if (attachment != null) {
        viewModel.attachmentUrl(issue, attachment)?.let { url ->
            MarkdownImageSource(
                url = url,
                bearerToken = viewModel.currentBearerToken(),
                description = attachment.filename,
            )
        }
    } else if (cleanDestination.startsWith("http://") || cleanDestination.startsWith("https://")) {
        MarkdownImageSource(url = cleanDestination)
    } else {
        null
    }
}

private fun isImageAttachment(attachment: IssueAttachment): Boolean =
    attachment.contentType?.startsWith("image/") == true ||
        attachment.filename.endsWith(".png", ignoreCase = true) ||
        attachment.filename.endsWith(".jpg", ignoreCase = true) ||
        attachment.filename.endsWith(".jpeg", ignoreCase = true) ||
        attachment.filename.endsWith(".gif", ignoreCase = true) ||
        attachment.filename.endsWith(".webp", ignoreCase = true) ||
        attachment.filename.endsWith(".bmp", ignoreCase = true)

private fun attachmentMatchesDestination(attachment: IssueAttachment, destination: String): Boolean {
    val withoutFragment = destination.substringBefore('#')
    val withoutQuery = withoutFragment.substringBefore('?')
    val decoded = runCatching { URLDecoder.decode(withoutQuery, "UTF-8") }.getOrDefault(withoutQuery)
    val filename = decoded.substringAfterLast('/').substringAfterLast('\\')
    return decoded == attachment.redmineAttachmentId.toString() ||
        decoded.contains("/${attachment.redmineAttachmentId}/") ||
        decoded.endsWith("/${attachment.redmineAttachmentId}") ||
        filename.equals(attachment.filename, ignoreCase = true)
}

@Composable
private fun GithubLinkRow(link: GithubLink, onOpen: () -> Unit, onRemove: () -> Unit) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(link.title ?: link.repositoryFullName, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(link.url, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = onOpen) { Text("Open") }
            TextButton(onClick = onRemove) { Text("Remove", color = MaterialTheme.colorScheme.error) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IssueHero(issue: Issue) {
    val uriHandler = LocalUriHandler.current
    val redmineUrl = if (issue.redmineBaseUrl != null && issue.redmineIssueId != null)
        "${issue.redmineBaseUrl.trimEnd('/')}/issues/${issue.redmineIssueId}"
    else null

    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        issue.displayId(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = if (redmineUrl != null) Modifier.clickable { uriHandler.openUri(redmineUrl) } else Modifier,
                    )
                    Text(issue.subject, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                }
                if (issue.isFavorited) {
                    Icon(Icons.Default.Star, contentDescription = "Favorite", tint = Color(0xFFF59E0B), modifier = Modifier.padding(start = 12.dp).size(22.dp))
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { PriorityPill(it) }
                issue.tracker?.takeIf { it.isNotBlank() }?.let { NeutralPill(it) }
                NeutralPill(if (issue.source == "local") "Local" else "Redmine")
            }
            issue.doneRatio?.let { ratio ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LinearProgressIndicator(
                        progress = { ratio / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("$ratio% complete", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            issue.projectName?.takeIf { it.isNotBlank() }?.let { IconText(Icons.Default.Folder, it) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IssueActionGrid(issue: Issue, state: MainUiState, viewModel: MainViewModel) {
    Section("Actions") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = viewModel::toggleFavorite, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(if (issue.isFavorited) Icons.Default.Star else Icons.Outlined.StarBorder, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text(if (issue.isFavorited) "Unfavorite" else "Favorite")
            }
            OutlinedButton(onClick = viewModel::openEditIssueDialog, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Edit")
            }
            OutlinedButton(onClick = viewModel::openAssignSheet, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Assign")
            }
            OutlinedButton(onClick = viewModel::summarizeIssue, enabled = !state.isLoading) {
                Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("AI Summary")
            }
            OutlinedButton(onClick = viewModel::categorizeIssue, enabled = !state.isLoading) {
                Text("AI Categorize")
            }
        }
    }
}

@Composable
private fun IssueKeyFacts(issue: Issue) {
    val dueDateColor = when (parseDueUrgency(issue.dueDate)) {
        DueUrgency.OVERDUE -> MaterialTheme.colorScheme.error
        DueUrgency.SOON -> Color(0xFFF59E0B)
        DueUrgency.NORMAL -> Color.Unspecified
    }

    Section("Key Facts") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FactRow(Icons.Default.Person, "Assignee", issue.assignedToName ?: "Unassigned")
            FactRow(Icons.Default.Person, "Author", issue.authorName ?: "Unknown")
            issue.categoryName?.takeIf { it.isNotBlank() }?.let { FactRow(Icons.Default.Info, "Category", it) }
            issue.parentIssueId?.let { FactRow(Icons.Default.AccountTree, "Parent", "#$it ${issue.parentIssueLabel ?: ""}") }
            FactRow(Icons.Default.CalendarToday, "Due", issue.dueDate?.formatDate() ?: "No due date", valueColor = dueDateColor)
            issue.startDate?.let { FactRow(Icons.Default.CalendarToday, "Start", it.formatDate()) }
            FactRow(Icons.Default.Refresh, "Updated", (issue.lastActivityAt ?: issue.updatedOnRemote)?.formatDate() ?: "Unknown")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                SmallStat("Spent", issue.spentHours?.let { "${it}h" } ?: "—", modifier = Modifier.weight(1f))
                SmallStat("Estimate", issue.estimatedHours?.let { "${it}h" } ?: "—", modifier = Modifier.weight(1f))
                issue.doneRatio?.let { ratio ->
                    SmallStat("Done", "$ratio%", modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CustomFieldsSection(issue: Issue) {
    val fields = issue.customFieldsJson.filter { field ->
        field.name.isNotBlank() && !field.value.isNullOrBlank()
    }
    if (fields.isEmpty()) return
    Section("Custom Fields") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            fields.forEach { field ->
                FactRow(Icons.Default.Info, field.name, field.value.orEmpty())
            }
        }
    }
}

@Composable
private fun StatusSummary(issue: Issue, disabled: Boolean, onChange: () -> Unit) {
    Section("Status") {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                StatusPill(issue.statusName)
                Text(
                    if (issue.allowedStatuses.isEmpty()) "No transitions available" else "${issue.allowedStatuses.size} transition${if (issue.allowedStatuses.size != 1) "s" else ""} available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = onChange,
                enabled = !disabled && issue.allowedStatuses.isNotEmpty() && issue.redmineIssueId != null,
            ) {
                Text("Change")
            }
        }
    }
}

@Composable
private fun AiSection(state: MainUiState) {
    if (state.aiSummary == null && state.aiCategorization == null) return
    Section("AI Insights") {
        state.aiSummary?.let { summary ->
            Text("Summary", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(summary.summary.ifBlank { "No summary text returned." }, style = MaterialTheme.typography.bodyMedium)
            if (summary.keyPoints.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text("Key Points", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                summary.keyPoints.take(5).forEach { Text("· $it", style = MaterialTheme.typography.bodySmall) }
            }
            if (summary.actionItems.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text("Action Items", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                summary.actionItems.take(5).forEach { Text("· $it", style = MaterialTheme.typography.bodySmall) }
            }
            summary.warning?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary) }
        }
        state.aiCategorization?.let { categorization ->
            if (state.aiSummary != null) { Spacer(Modifier.height(8.dp)); HorizontalDivider(); Spacer(Modifier.height(8.dp)) }
            Text("Categorization", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(categorization.reasoning.ifBlank { "No reasoning returned." }, style = MaterialTheme.typography.bodyMedium)
            categorization.suggestedPriority?.get("name")?.toString()?.let { Text("Priority: $it", style = MaterialTheme.typography.bodySmall) }
            categorization.suggestedCategory?.get("name")?.toString()?.let { Text("Category: $it", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatusBottomSheet(
    issue: Issue,
    disabled: Boolean,
    sheetState: androidx.compose.material3.SheetState,
    onDismiss: () -> Unit,
    onSelect: (AllowedStatus) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Change Status", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("Current: ${issue.statusName}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            HorizontalDivider()
            issue.allowedStatuses.forEach { status ->
                OutlinedButton(onClick = { onSelect(status) }, enabled = !disabled, modifier = Modifier.fillMaxWidth()) {
                    Text(status.name)
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssignBottomSheet(users: List<AssignableUser>, disabled: Boolean, onDismiss: () -> Unit, onSelect: (Int) -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Assign Issue", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            HorizontalDivider()
            if (users.isEmpty()) {
                Text("No assignable users found.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            users.take(40).forEach { user ->
                OutlinedButton(onClick = { onSelect(user.id) }, enabled = !disabled, modifier = Modifier.fillMaxWidth()) {
                    AssigneeAvatar(user.name)
                    Spacer(Modifier.width(10.dp))
                    Text(user.name, modifier = Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun EditIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(title = "Edit Issue", onDismiss = viewModel::hideEditIssueDialog, onConfirm = viewModel::saveIssueEdits, confirmLabel = "Save") {
        FormTextField("Subject", state.editSubject, viewModel::updateEditSubject)
        FormTextField("Description", state.editDescription, viewModel::updateEditDescription, minLines = 4)
        FormTextField("Priority name", state.editPriority, viewModel::updateEditPriority)
        FormTextField("Due date (YYYY-MM-DD)", state.editDueDate, viewModel::updateEditDueDate)
        FormTextField("Start date (YYYY-MM-DD)", state.editStartDate, viewModel::updateEditStartDate)
        FormTextField("Estimate hours", state.editEstimate, viewModel::updateEditEstimate, numeric = true)
    }
}

@Composable
private fun TimeEntryDialog(state: MainUiState, viewModel: MainViewModel) {
    val editing = state.editingTimeEntryId != null
    FormDialog(title = if (editing) "Edit Time" else "Log Time", onDismiss = viewModel::hideTimeDialog, onConfirm = viewModel::createTimeEntry, confirmLabel = if (editing) "Save" else "Log") {
        FormTextField("Hours", state.timeHours, viewModel::updateTimeHours, numeric = true)
        FormTextField("Activity ID", state.timeActivityId, viewModel::updateTimeActivityId, numeric = true)
        if (state.activities.isNotEmpty()) {
            Text("Activities: ${state.activities.take(6).joinToString { "${it.id} ${it.name}" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        FormTextField("Spent on (YYYY-MM-DD)", state.timeSpentOn, viewModel::updateTimeSpentOn)
        FormTextField("Comment", state.timeComment, viewModel::updateTimeComment, minLines = 2)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RelationDialog(state: MainUiState, viewModel: MainViewModel) {
    val relationTypes = listOf("relates", "duplicates", "duplicated", "blocks", "blocked", "precedes", "follows", "copied_to", "copied_from")
    FormDialog(title = "Add Relation", onDismiss = viewModel::hideRelationDialog, onConfirm = viewModel::createRelation, confirmLabel = "Add") {
        FormTextField("Issue ID", state.relationTargetId, viewModel::updateRelationTargetId, numeric = true)
        Text("Relation type", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            relationTypes.forEach { type ->
                androidx.compose.material3.FilterChip(
                    selected = state.relationType == type,
                    onClick = { viewModel.updateRelationType(type) },
                    label = { Text(type, style = MaterialTheme.typography.labelSmall) },
                )
            }
        }
    }
}

@Composable
private fun InternalNoteDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(title = "Internal Note", onDismiss = viewModel::hideInternalNoteDialog, onConfirm = viewModel::createInternalNote, confirmLabel = "Add") {
        FormTextField("Note", state.internalNoteDraft, viewModel::updateInternalNoteDraft, minLines = 5)
    }
}

@Composable
private fun GithubLinkDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(title = "GitHub Link", onDismiss = viewModel::hideGithubDialog, onConfirm = viewModel::addGithubLink, confirmLabel = "Add") {
        FormTextField("Repository (owner/repo)", state.githubRepository, viewModel::updateGithubRepository)
        FormTextField("Issue number", state.githubIssueNumber, viewModel::updateGithubIssueNumber, numeric = true)
        FormTextField("PR number", state.githubPrNumber, viewModel::updateGithubPrNumber, numeric = true)
        FormTextField("URL", state.githubUrl, viewModel::updateGithubUrl)
        FormTextField("Title", state.githubTitle, viewModel::updateGithubTitle)
    }
}
