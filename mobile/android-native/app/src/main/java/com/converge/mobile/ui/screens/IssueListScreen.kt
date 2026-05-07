package com.converge.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.converge.mobile.data.Issue
import com.converge.mobile.data.SearchResult
import com.converge.mobile.data.displayId
import com.converge.mobile.data.formatDate
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.SearchMode
import com.converge.mobile.ui.SortMode
import com.converge.mobile.ui.components.AssigneeAvatar
import com.converge.mobile.ui.components.EmptyState
import com.converge.mobile.ui.components.ErrorBanner
import com.converge.mobile.ui.components.FormDialog
import com.converge.mobile.ui.components.FormTextField
import com.converge.mobile.ui.components.PriorityPill
import com.converge.mobile.ui.components.ShimmerIssueItem
import com.converge.mobile.data.DueUrgency
import com.converge.mobile.data.parseDueUrgency
import com.converge.mobile.ui.components.StatusPill

private val STATUS_FILTERS = listOf("All", "Open", "In Progress", "Resolved", "Closed")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IssueListScreen(state: MainUiState, viewModel: MainViewModel) {
    val focusManager = LocalFocusManager.current
    var showSearch by remember { mutableStateOf(false) }
    var showOverflow by remember { mutableStateOf(false) }
    var previewIssue by remember { mutableStateOf<Issue?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val priorityOptions = remember(state.issues) {
        state.issues.mapNotNull { it.priority?.takeIf(String::isNotBlank) }.distinct().sorted()
    }
    val projectOptions = remember(state.issues, state.catalogProjects) {
        (state.catalogProjects.map { it.name } + state.issues.mapNotNull { it.projectName?.takeIf(String::isNotBlank) })
            .distinct()
            .sorted()
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = listState.layoutInfo.totalItemsCount
            total > 0 && lastVisible >= total - 4
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMoreIssues()
    }

    LaunchedEffect(state.actionMessage) {
        state.actionMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionMessage()
        }
    }

    if (state.showCreateIssueDialog) CreateIssueDialog(state, viewModel)
    previewIssue?.let { issue ->
        IssuePreviewDialog(
            issue = issue,
            onDismiss = { previewIssue = null },
            onOpen = {
                previewIssue = null
                viewModel.selectIssue(issue)
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (showSearch) {
                        OutlinedTextField(
                            value = state.search,
                            onValueChange = viewModel::updateSearch,
                            placeholder = { Text("Search issues…", style = MaterialTheme.typography.bodyMedium) },
                            modifier = Modifier.fillMaxWidth().padding(end = 4.dp, bottom = 4.dp),
                            singleLine = true,
                            textStyle = MaterialTheme.typography.bodyMedium,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(onSearch = {
                                focusManager.clearFocus()
                                if (state.searchMode == SearchMode.FTS) viewModel.performFtsSearch()
                                else viewModel.loadIssues()
                            }),
                            colors = OutlinedTextFieldDefaults.colors(
                                unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f),
                            ),
                        )
                    } else {
                        Text("Issues", fontWeight = FontWeight.SemiBold)
                    }
                },
                actions = {
                    if (showSearch) {
                        IconButton(onClick = {
                            showSearch = false
                            viewModel.updateSearch("")
                            viewModel.loadIssues()
                        }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear search")
                        }
                    } else {
                        IconButton(onClick = { showSearch = true }) {
                            Icon(Icons.Default.Search, contentDescription = "Search")
                        }
                        IconButton(onClick = viewModel::loadIssues, enabled = !state.isLoading) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                        }
                        IconButton(onClick = viewModel::logout) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Logout")
                        }
                        Box {
                            IconButton(onClick = { showOverflow = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "More")
                            }
                            DropdownMenu(expanded = showOverflow, onDismissRequest = { showOverflow = false }) {
                                DropdownMenuItem(text = { Text("Sort", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }, onClick = {}, enabled = false)
                                SortMode.entries.forEach { mode ->
                                    DropdownMenuItem(
                                        text = { Text(mode.label) },
                                        leadingIcon = {
                                            if (state.sortMode == mode) Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                        },
                                        onClick = { showOverflow = false; viewModel.updateSortMode(mode) },
                                    )
                                }
                                HorizontalDivider()
                                DropdownMenuItem(text = { Text("Search Mode", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }, onClick = {}, enabled = false)
                                SearchMode.entries.forEach { mode ->
                                    DropdownMenuItem(
                                        text = { Text(mode.label) },
                                        leadingIcon = {
                                            if (state.searchMode == mode) Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                        },
                                        onClick = { showOverflow = false; viewModel.updateSearchMode(mode) },
                                    )
                                }
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text(if (state.openOnly) "Open only: On" else "Open only: Off") },
                                    leadingIcon = {
                                        if (state.openOnly) Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                    },
                                    onClick = { showOverflow = false; viewModel.toggleOpenOnly() },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (state.compactList) "Density: Compact" else "Density: Comfortable") },
                                    leadingIcon = {
                                        if (state.compactList) Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                    },
                                    onClick = { showOverflow = false; viewModel.toggleCompactList() },
                                )
                                HorizontalDivider()
                                DropdownMenuItem(text = { Text("Rotate Token") }, onClick = { showOverflow = false; viewModel.rotateToken() })
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            ErrorBanner(state.errorMessage, viewModel::clearError)
            IssueDashboardSummary(state)
            SavedViewsRow(state, viewModel)

            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(STATUS_FILTERS) { filter ->
                    FilterChip(
                        selected = state.statusFilter == filter,
                        onClick = { viewModel.updateStatusFilter(filter) },
                        label = { Text(filter, style = MaterialTheme.typography.labelSmall) },
                    )
                }
                if (priorityOptions.isNotEmpty()) {
                    item {
                        FilterChip(
                            selected = state.priorityFilter == "All",
                            onClick = { viewModel.updatePriorityFilter("All") },
                            label = { Text("Any Priority", style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                    items(priorityOptions) { priority ->
                        FilterChip(
                            selected = state.priorityFilter == priority,
                            onClick = { viewModel.updatePriorityFilter(priority) },
                            label = { Text(priority, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
                if (projectOptions.isNotEmpty()) {
                    item {
                        FilterChip(
                            selected = state.projectFilter == "All",
                            onClick = { viewModel.updateProjectFilter("All") },
                            label = { Text("Any Project", style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                    items(projectOptions) { project ->
                        FilterChip(
                            selected = state.projectFilter == project,
                            onClick = { viewModel.updateProjectFilter(project) },
                            label = { Text(project, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        )
                    }
                }
            }
            HorizontalDivider(thickness = 0.5.dp)

            PullToRefreshBox(
                isRefreshing = state.isLoading,
                onRefresh = viewModel::loadIssues,
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
                    state.searchMode == SearchMode.FTS -> {
                        if (state.isLoading) {
                            LazyColumn(modifier = Modifier.fillMaxSize()) { items(7) { ShimmerIssueItem() } }
                        } else if (state.ftsResults.isEmpty()) {
                            EmptyState(if (state.search.length < 2) "Type to search…" else "No results for \"${state.search}\".")
                        } else {
                            LazyColumn(modifier = Modifier.fillMaxSize()) {
                                item {
                                    Text(
                                        "${state.ftsResults.size} result${if (state.ftsResults.size != 1) "s" else ""} for \"${state.search}\"",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                                    )
                                }
                                items(state.ftsResults, key = { it.id }) { result ->
                                    FtsResultRow(result, onClick = { viewModel.selectIssueById(result.redmineIssueId) })
                                    HorizontalDivider(thickness = 0.5.dp)
                                }
                            }
                        }
                    }
                    state.isLoading && state.issues.isEmpty() -> {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(7) { ShimmerIssueItem() }
                        }
                    }
                    state.issues.isEmpty() -> EmptyState("No issues found.")
                    else -> {
                        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                            item {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(
                                        "${state.issues.size} of ${state.totalIssues} issue${if (state.totalIssues != 1) "s" else ""}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Text(
                                        "${state.sortMode.label} · ${state.searchMode.label}${if (state.openOnly) " · Open" else ""}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                            items(state.issues, key = { it.id }) { issue ->
                                IssueRow(
                                    issue = issue,
                                    compact = state.compactList,
                                    onClick = { viewModel.selectIssue(issue) },
                                    onPeek = { previewIssue = issue },
                                )
                                HorizontalDivider(thickness = 0.5.dp)
                            }
                            item {
                                Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                    when {
                                        state.isLoadingMore -> CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                                        state.issues.size >= state.totalIssues && state.totalIssues > 0 ->
                                            Text("All ${state.totalIssues} issues loaded", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IssueDashboardSummary(state: MainUiState) {
    if (state.issues.isEmpty()) return
    val open = state.issues.count { it.statusName.lowercase().let { status -> !status.contains("closed") && !status.contains("resolved") } }
    val dueSoon = state.issues.count { parseDueUrgency(it.dueDate) == DueUrgency.SOON }
    val overdue = state.issues.count { parseDueUrgency(it.dueDate) == DueUrgency.OVERDUE }
    val favorites = state.issues.count { it.isFavorited }

    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { DashboardStat("Loaded", state.issues.size.toString()) }
        item { DashboardStat("Open", open.toString()) }
        item { DashboardStat("Due soon", dueSoon.toString(), warn = dueSoon > 0) }
        item { DashboardStat("Overdue", overdue.toString(), danger = overdue > 0) }
        item { DashboardStat("Favorites", favorites.toString()) }
    }
}

@Composable
private fun DashboardStat(label: String, value: String, warn: Boolean = false, danger: Boolean = false) {
    val container = when {
        danger -> MaterialTheme.colorScheme.errorContainer
        warn -> Color(0xFFFFF7ED)
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val content = when {
        danger -> MaterialTheme.colorScheme.onErrorContainer
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Card(
        shape = MaterialTheme.shapes.small,
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun SavedViewsRow(state: MainUiState, viewModel: MainViewModel) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        item {
            OutlinedTextField(
                value = state.savedViewName,
                onValueChange = viewModel::updateSavedViewName,
                placeholder = { Text("View name") },
                singleLine = true,
                textStyle = MaterialTheme.typography.labelMedium,
                modifier = Modifier.size(width = 132.dp, height = 54.dp),
            )
        }
        item {
            TextButton(onClick = viewModel::saveCurrentView) {
                Text("Save")
            }
        }
        items(state.savedViews, key = { it.id }) { savedView ->
            FilterChip(
                selected = state.activeSavedViewId == savedView.id,
                onClick = { viewModel.applySavedView(savedView) },
                label = { Text(savedView.name, style = MaterialTheme.typography.labelSmall) },
                trailingIcon = {
                    Text(
                        "×",
                        modifier = Modifier.clickable { viewModel.deleteSavedView(savedView.id) },
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
            )
        }
    }
}

@Composable
private fun IssueRow(issue: Issue, compact: Boolean, onClick: () -> Unit, onPeek: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = if (compact) 7.dp else 10.dp),
        verticalArrangement = Arrangement.spacedBy(if (compact) 2.dp else 4.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Text(issue.subject, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(end = 8.dp))
            TextButton(onClick = onPeek, modifier = Modifier.padding(0.dp)) {
                Text(issue.displayId(), style = MaterialTheme.typography.labelSmall)
            }
        }
        if (!compact) issue.projectName?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { PriorityPill(it) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                issue.assignedToName?.let { AssigneeAvatar(it) }
                issue.dueDate?.let { dd ->
                    val urgencyColor = when (parseDueUrgency(dd)) {
                        DueUrgency.OVERDUE -> MaterialTheme.colorScheme.error
                        DueUrgency.SOON -> Color(0xFFF59E0B)
                        DueUrgency.NORMAL -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                    Text("Due ${dd.formatDate()}", style = MaterialTheme.typography.labelSmall, color = urgencyColor)
                }
            }
        }
    }
}

@Composable
private fun IssuePreviewDialog(issue: Issue, onDismiss: () -> Unit, onOpen: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { Button(onClick = onOpen) { Text("Open") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Close") } },
        title = { Text("${issue.displayId()} · ${issue.subject}", maxLines = 2, overflow = TextOverflow.Ellipsis) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                issue.projectName?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    StatusPill(issue.statusName)
                    issue.priority?.takeIf { it.isNotBlank() }?.let { PriorityPill(it) }
                }
                Text("Assignee: ${issue.assignedToName ?: "Unassigned"}", style = MaterialTheme.typography.bodySmall)
                Text("Due: ${issue.dueDate?.formatDate() ?: "No due date"}", style = MaterialTheme.typography.bodySmall)
                issue.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, maxLines = 5, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
    )
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
fun CreateIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(title = "Create Issue", onDismiss = viewModel::hideCreateIssueDialog, onConfirm = viewModel::createIssue, confirmLabel = "Create") {
        FormTextField("Subject", state.createSubject, viewModel::updateCreateSubject)
        if (state.catalogProjects.isNotEmpty()) {
            Text("Project", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(state.catalogProjects, key = { it.id }) { project ->
                    FilterChip(
                        selected = state.createProjectId == project.id.toString(),
                        onClick = { viewModel.updateCreateProjectId(project.id.toString()) },
                        label = { Text(project.name, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        } else {
            FormTextField("Project ID", state.createProjectId, viewModel::updateCreateProjectId, numeric = true)
        }
        FormTextField("Description", state.createDescription, viewModel::updateCreateDescription, minLines = 3)
        if (state.catalogPriorities.isNotEmpty()) {
            Text("Priority", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(state.catalogPriorities, key = { it.id }) { priority ->
                    FilterChip(
                        selected = state.createPriorityId == priority.id.toString(),
                        onClick = { viewModel.updateCreatePriorityId(priority.id.toString()) },
                        label = { Text(priority.name, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        } else {
            FormTextField("Priority ID", state.createPriorityId, viewModel::updateCreatePriorityId, numeric = true)
        }
        if (state.catalogTrackers.isNotEmpty()) {
            Text("Tracker", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                state.catalogTrackers.forEach { tracker ->
                    FilterChip(
                        selected = state.createTrackerId == tracker.id.toString(),
                        onClick = { viewModel.updateCreateTrackerId(tracker.id.toString()) },
                        label = { Text(tracker.name, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        }
        FormTextField("Due date (YYYY-MM-DD)", state.createDueDate, viewModel::updateCreateDueDate)
    }
}

@Composable
private fun FtsResultRow(result: SearchResult, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                result.subject,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                result.projectName?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                result.assignedToName?.let {
                    Text("· $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            StatusPill(result.statusName)
            result.dueDate?.let {
                Text(it.formatDate(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
