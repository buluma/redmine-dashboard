package com.converge.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Comment
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountTree
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.converge.mobile.data.AllowedStatus
import com.converge.mobile.data.AssignableUser
import com.converge.mobile.data.GithubLink
import com.converge.mobile.data.InternalNote
import com.converge.mobile.data.Issue
import com.converge.mobile.data.TimeEntry
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.MarkdownDescription
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ConvergeTheme {
                val viewModel: MainViewModel = viewModel()
                ConvergeApp(viewModel)
            }
        }
    }
}

@Composable
private fun ConvergeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = androidx.compose.ui.graphics.Color(0xFF0F766E),
            secondary = androidx.compose.ui.graphics.Color(0xFF334155),
            surface = androidx.compose.ui.graphics.Color(0xFFF8FAFC),
            background = androidx.compose.ui.graphics.Color(0xFFF8FAFC),
        ),
        content = content,
    )
}

@Composable
private fun ConvergeApp(viewModel: MainViewModel) {
    val state by viewModel.state
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            !state.isPaired -> PairScreen(state, viewModel)
            state.selectedIssue != null -> IssueDetailScreen(state, viewModel)
            else -> IssueListScreen(state, viewModel)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PairScreen(state: MainUiState, viewModel: MainViewModel) {
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Converge-Compose") })
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Pair Android Client", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            ErrorBanner(state.errorMessage, viewModel::clearError)
            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = viewModel::updateServerUrl,
                label = { Text("Converge server URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.redmineBaseUrl,
                onValueChange = viewModel::updateRedmineBaseUrl,
                label = { Text("Redmine base URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.redmineApiKey,
                onValueChange = viewModel::updateRedmineApiKey,
                label = { Text("Redmine API key") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.deviceName,
                onValueChange = viewModel::updateDeviceName,
                label = { Text("Device name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = viewModel::pairDevice,
                enabled = !state.isLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.isLoading) "Pairing..." else "Pair Device")
            }
            if (state.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IssueListScreen(state: MainUiState, viewModel: MainViewModel) {
    if (state.showCreateIssueDialog) {
        CreateIssueDialog(state, viewModel)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Issues") },
                actions = {
                    IconButton(onClick = viewModel::showCreateIssueDialog, enabled = !state.isLoading) {
                        Icon(Icons.Default.Add, contentDescription = "Create issue")
                    }
                    TextButton(onClick = viewModel::rotateToken, enabled = !state.isLoading) {
                        Text("Rotate")
                    }
                    IconButton(onClick = viewModel::loadIssues, enabled = !state.isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = viewModel::logout, enabled = !state.isLoading) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Logout")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ErrorBanner(state.errorMessage, viewModel::clearError)
            ActionBanner(state.actionMessage, viewModel::clearActionMessage)
            OutlinedTextField(
                value = state.search,
                onValueChange = viewModel::updateSearch,
                label = { Text("Search issues") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::loadIssues, enabled = !state.isLoading) {
                    Text("Search")
                }
                OutlinedButton(onClick = { viewModel.updateSearch(""); viewModel.loadIssues() }, enabled = !state.isLoading) {
                    Text("Clear")
                }
            }
            if (state.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            if (!state.isLoading && state.issues.isEmpty()) {
                EmptyState("No issues found.")
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.issues, key = { it.id }) { issue ->
                        IssueCard(issue = issue, onClick = { viewModel.selectIssue(issue) })
                    }
                }
            }
        }
    }
}

@Composable
private fun IssueCard(issue: Issue, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(issue.displayId(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(issue.subject, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { StatusPill(it) }
            }
            Text(issue.projectName ?: "No project", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun IssueDetailScreen(state: MainUiState, viewModel: MainViewModel) {
    val issue = state.selectedIssue ?: return
    val statusSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var showStatusSheet by remember { mutableStateOf(false) }

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
    if (state.showEditIssueDialog) {
        EditIssueDialog(state, viewModel)
    }
    if (state.showTimeDialog) {
        TimeEntryDialog(state, viewModel)
    }
    if (state.showInternalNoteDialog) {
        InternalNoteDialog(state, viewModel)
    }
    if (state.showGithubDialog) {
        GithubLinkDialog(state, viewModel)
    }
    if (state.showAssignSheet) {
        AssignBottomSheet(
            users = state.assignableUsers,
            disabled = state.isLoading,
            onDismiss = viewModel::hideAssignSheet,
            onSelect = viewModel::assignIssue,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(issue.displayId()) },
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
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ErrorBanner(state.errorMessage, viewModel::clearError)
            ActionBanner(state.actionMessage, viewModel::clearActionMessage)
            if (state.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            IssueHero(issue)
            IssueActionGrid(issue, state, viewModel)
            IssueKeyFacts(issue)
            StatusSummary(issue, state.isLoading, onChange = { showStatusSheet = true })

            Section("Description") {
                val description = issue.description?.takeIf { it.isNotBlank() }
                if (description == null) {
                    Text(
                        "No description provided.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                } else {
                    MarkdownDescription(description)
                }
            }

            Section("Comment") {
                if (issue.redmineIssueId == null) {
                    Text(
                        "Local-only issue. Comments cannot sync to Redmine from mobile.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                OutlinedTextField(
                    value = state.commentDraft,
                    onValueChange = viewModel::updateCommentDraft,
                    label = { Text("Add note") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = viewModel::postComment,
                    enabled = !state.isLoading && issue.redmineIssueId != null,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Post Comment")
                }
            }

            AiSection(state)
            TimeEntriesSection(issue.timeEntries, onAdd = viewModel::openTimeDialog, onDelete = viewModel::deleteTimeEntry)
            InternalNotesSection(state.internalNotes, onAdd = viewModel::openInternalNoteDialog)
            GithubLinksSection(issue.githubLinks, onAdd = viewModel::openGithubDialog, onRemove = viewModel::removeGithubLink)
            IssueMetadata(issue)
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IssueActionGrid(issue: Issue, state: MainUiState, viewModel: MainViewModel) {
    Section("Actions") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = viewModel::toggleFavorite, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(if (issue.isFavorited) Icons.Default.Star else Icons.Outlined.StarBorder, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(if (issue.isFavorited) "Unfavorite" else "Favorite")
            }
            OutlinedButton(onClick = viewModel::openEditIssueDialog, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Edit")
            }
            OutlinedButton(onClick = viewModel::openAssignSheet, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Assign")
            }
            OutlinedButton(onClick = viewModel::openTimeDialog, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Timer, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Time")
            }
            OutlinedButton(onClick = viewModel::openInternalNoteDialog, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.AutoMirrored.Filled.Comment, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Note")
            }
            OutlinedButton(onClick = viewModel::openGithubDialog, enabled = !state.isLoading && issue.redmineIssueId != null) {
                Icon(Icons.Default.Link, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("GitHub")
            }
            OutlinedButton(onClick = viewModel::summarizeIssue, enabled = !state.isLoading) {
                Text("AI Summary")
            }
            OutlinedButton(onClick = viewModel::categorizeIssue, enabled = !state.isLoading) {
                Text("AI Categorize")
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun IssueHero(issue: Issue) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(issue.displayId(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    Text(issue.subject, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                }
                if (issue.isFavorited) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = "Favorite",
                        tint = Color(0xFFF59E0B),
                        modifier = Modifier.padding(start = 12.dp).size(22.dp),
                    )
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { StatusPill(it) }
                issue.tracker?.takeIf { it.isNotBlank() }?.let { NeutralPill(it) }
                NeutralPill(if (issue.source == "local") "Local" else "Redmine")
            }
            issue.projectName?.takeIf { it.isNotBlank() }?.let {
                IconText(Icons.Default.Folder, it)
            }
        }
    }
}

@Composable
private fun IssueKeyFacts(issue: Issue) {
    Section("Key Facts") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FactRow(Icons.Default.Person, "Assignee", issue.assignedToName ?: "Unassigned")
            FactRow(Icons.Default.Person, "Author", issue.authorName ?: "Unknown")
            FactRow(Icons.Default.CalendarToday, "Due", issue.dueDate ?: "No due date")
            FactRow(Icons.Default.Refresh, "Updated", issue.lastActivityAt ?: issue.updatedOnRemote ?: "Unknown")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                SmallStat("Spent", issue.spentHours?.let { "${it}h" } ?: "-", modifier = Modifier.weight(1f))
                SmallStat("Estimate", issue.estimatedHours?.let { "${it}h" } ?: "-", modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun StatusSummary(issue: Issue, disabled: Boolean, onChange: () -> Unit) {
    Section("Status") {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                StatusPill(issue.statusName)
                Text(
                    if (issue.allowedStatuses.isEmpty()) "No mobile transitions available" else "${issue.allowedStatuses.size} transitions available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StatusBottomSheet(
    issue: Issue,
    disabled: Boolean,
    sheetState: androidx.compose.material3.SheetState,
    onDismiss: () -> Unit,
    onSelect: (AllowedStatus) -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Change Status", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text("Current: ${issue.statusName}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
            issue.allowedStatuses.forEach { status ->
                OutlinedButton(
                    onClick = { onSelect(status) },
                    enabled = !disabled,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(status.name)
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun IssueMetadata(issue: Issue) {
    Section("Related") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FactRow(Icons.Default.Link, "GitHub links", issue.githubLinks.size.toString())
            FactRow(Icons.Default.AttachFile, "Attachments", issue.attachments.size.toString())
            FactRow(Icons.Default.AccountTree, "Relations", issue.relations.size.toString())
            FactRow(Icons.Default.Timer, "Time entries", issue.timeEntries.size.toString())
            if (issue.children.isNotEmpty()) {
                HorizontalDivider()
                Text("Child Issues", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                issue.children.take(5).forEach { child ->
                    Text("#${child.id} ${child.subject}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (issue.attachments.isNotEmpty()) {
                HorizontalDivider()
                Text("Attachments", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                issue.attachments.take(5).forEach { attachment ->
                    Text(
                        "${attachment.filename} (${attachment.filesize / 1024} KB)",
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (issue.relations.isNotEmpty()) {
                HorizontalDivider()
                Text("Relations", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                issue.relations.take(5).forEach { relation ->
                    Text(
                        "${relation.relationType} #${relation.targetIssueId}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun AiSection(state: MainUiState) {
    if (state.aiSummary == null && state.aiCategorization == null) return
    Section("AI") {
        state.aiSummary?.let { summary ->
            Text("Summary", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(summary.summary.ifBlank { "No summary text returned." }, style = MaterialTheme.typography.bodyMedium)
            if (summary.keyPoints.isNotEmpty()) {
                Text("Key Points", style = MaterialTheme.typography.labelLarge)
                summary.keyPoints.take(5).forEach { Text("- $it", style = MaterialTheme.typography.bodySmall) }
            }
            if (summary.actionItems.isNotEmpty()) {
                Text("Action Items", style = MaterialTheme.typography.labelLarge)
                summary.actionItems.take(5).forEach { Text("- $it", style = MaterialTheme.typography.bodySmall) }
            }
            summary.warning?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFFB45309)) }
        }
        state.aiCategorization?.let { categorization ->
            if (state.aiSummary != null) HorizontalDivider()
            Text("Categorization", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(categorization.reasoning.ifBlank { "No reasoning returned." }, style = MaterialTheme.typography.bodyMedium)
            categorization.suggestedPriority?.get("name")?.toString()?.let { Text("Priority: $it", style = MaterialTheme.typography.bodySmall) }
            categorization.suggestedCategory?.get("name")?.toString()?.let { Text("Category: $it", style = MaterialTheme.typography.bodySmall) }
            if (categorization.suggestedTags.isNotEmpty()) {
                Text(
                    "Tags: ${categorization.suggestedTags.mapNotNull { it["name"]?.toString() }.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun TimeEntriesSection(entries: List<TimeEntry>, onAdd: () -> Unit, onDelete: (Int) -> Unit) {
    Section("Time Entries") {
        Button(onClick = onAdd, modifier = Modifier.fillMaxWidth()) {
            Text("Log Time")
        }
        if (entries.isEmpty()) {
            Text("No time entries.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        entries.take(8).forEach { entry ->
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("${entry.hours}h - ${entry.activityName ?: "Activity"}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Text("${entry.spentOn} ${entry.comments.orEmpty()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                }
                entry.redmineTimeEntryId?.let {
                    TextButton(onClick = { onDelete(it) }) { Text("Delete") }
                }
            }
        }
    }
}

@Composable
private fun InternalNotesSection(notes: List<InternalNote>, onAdd: () -> Unit) {
    Section("Internal Notes") {
        Button(onClick = onAdd, modifier = Modifier.fillMaxWidth()) {
            Text("Add Internal Note")
        }
        if (notes.isEmpty()) {
            Text("No internal notes.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        notes.take(8).forEach { note ->
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(note.content, style = MaterialTheme.typography.bodyMedium)
                Text("${note.authorName} - ${note.createdAt.take(10)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
            }
        }
    }
}

@Composable
private fun GithubLinksSection(links: List<GithubLink>, onAdd: () -> Unit, onRemove: (String) -> Unit) {
    val uriHandler = LocalUriHandler.current
    Section("GitHub Links") {
        Button(onClick = onAdd, modifier = Modifier.fillMaxWidth()) {
            Text("Add GitHub Link")
        }
        if (links.isEmpty()) {
            Text("No GitHub links.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        links.take(10).forEach { link ->
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(link.title ?: link.repositoryFullName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Text(link.url, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                TextButton(onClick = { uriHandler.openUri(link.url) }) { Text("Open") }
                TextButton(onClick = { onRemove(link.id) }) { Text("Remove") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssignBottomSheet(
    users: List<AssignableUser>,
    disabled: Boolean,
    onDismiss: () -> Unit,
    onSelect: (Int) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Assign Issue", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            users.take(40).forEach { user ->
                OutlinedButton(onClick = { onSelect(user.id) }, enabled = !disabled, modifier = Modifier.fillMaxWidth()) {
                    Text(user.name)
                }
            }
            if (users.isEmpty()) {
                Text("No assignable users found.", color = MaterialTheme.colorScheme.secondary)
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun CreateIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(
        title = "Create Issue",
        onDismiss = viewModel::hideCreateIssueDialog,
        onConfirm = viewModel::createIssue,
        confirmLabel = "Create",
    ) {
        FormTextField("Subject", state.createSubject, viewModel::updateCreateSubject)
        FormTextField("Project ID", state.createProjectId, viewModel::updateCreateProjectId, numeric = true)
        FormTextField("Description", state.createDescription, viewModel::updateCreateDescription, minLines = 3)
        FormTextField("Priority ID", state.createPriorityId, viewModel::updateCreatePriorityId, numeric = true)
        FormTextField("Due date (YYYY-MM-DD)", state.createDueDate, viewModel::updateCreateDueDate)
    }
}

@Composable
private fun EditIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(
        title = "Edit Issue",
        onDismiss = viewModel::hideEditIssueDialog,
        onConfirm = viewModel::saveIssueEdits,
        confirmLabel = "Save",
    ) {
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
    FormDialog(
        title = "Log Time",
        onDismiss = viewModel::hideTimeDialog,
        onConfirm = viewModel::createTimeEntry,
        confirmLabel = "Log",
    ) {
        FormTextField("Hours", state.timeHours, viewModel::updateTimeHours, numeric = true)
        FormTextField("Activity ID", state.timeActivityId, viewModel::updateTimeActivityId, numeric = true)
        if (state.activities.isNotEmpty()) {
            Text("Activities: ${state.activities.take(6).joinToString { "${it.id} ${it.name}" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
        }
        FormTextField("Spent on (YYYY-MM-DD)", state.timeSpentOn, viewModel::updateTimeSpentOn)
        FormTextField("Comment", state.timeComment, viewModel::updateTimeComment, minLines = 2)
    }
}

@Composable
private fun InternalNoteDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(
        title = "Internal Note",
        onDismiss = viewModel::hideInternalNoteDialog,
        onConfirm = viewModel::createInternalNote,
        confirmLabel = "Add",
    ) {
        FormTextField("Note", state.internalNoteDraft, viewModel::updateInternalNoteDraft, minLines = 5)
    }
}

@Composable
private fun GithubLinkDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(
        title = "GitHub Link",
        onDismiss = viewModel::hideGithubDialog,
        onConfirm = viewModel::addGithubLink,
        confirmLabel = "Add",
    ) {
        FormTextField("Repository (owner/repo)", state.githubRepository, viewModel::updateGithubRepository)
        FormTextField("Issue number", state.githubIssueNumber, viewModel::updateGithubIssueNumber, numeric = true)
        FormTextField("PR number", state.githubPrNumber, viewModel::updateGithubPrNumber, numeric = true)
        FormTextField("URL", state.githubUrl, viewModel::updateGithubUrl)
        FormTextField("Title", state.githubTitle, viewModel::updateGithubTitle)
    }
}

@Composable
private fun FormDialog(
    title: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmLabel: String,
    content: @Composable () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            Button(onClick = onConfirm) { Text(confirmLabel) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                content()
            }
        },
    )
}

@Composable
private fun FormTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    numeric: Boolean = false,
    minLines: Int = 1,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        keyboardOptions = if (numeric) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default,
        minLines = minLines,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            content()
        }
    }
}

@Composable
private fun StatusPill(text: String) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun NeutralPill(text: String) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = Color(0xFFE2E8F0),
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFF334155),
        )
    }
}

@Composable
private fun FactRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(label, modifier = Modifier.width(92.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
        Text(value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun IconText(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
    }
}

@Composable
private fun SmallStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFFF1F5F9),
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun ErrorBanner(message: String?, onDismiss: () -> Unit) {
    if (message.isNullOrBlank()) return
    Card(
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFFF1F2)),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(message, color = androidx.compose.ui.graphics.Color(0xFF9F1239), modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) {
                Text("Dismiss")
            }
        }
    }
}

@Composable
private fun ActionBanner(message: String?, onDismiss: () -> Unit) {
    if (message.isNullOrBlank()) return
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(message, color = Color(0xFF047857), modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) {
                Text("Dismiss")
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

private fun Issue.displayId(): String = redmineIssueId?.let { "#$it" } ?: localIssueNumber?.let { "L$it" } ?: id
