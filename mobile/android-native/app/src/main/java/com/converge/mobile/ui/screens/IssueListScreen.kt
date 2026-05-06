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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.converge.mobile.data.Issue
import com.converge.mobile.data.displayId
import com.converge.mobile.data.formatDate
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.SortMode
import com.converge.mobile.ui.components.AssigneeAvatar
import com.converge.mobile.ui.components.EmptyState
import com.converge.mobile.ui.components.ErrorBanner
import com.converge.mobile.ui.components.FormDialog
import com.converge.mobile.ui.components.FormTextField
import com.converge.mobile.ui.components.PriorityPill
import com.converge.mobile.ui.components.ShimmerIssueItem
import com.converge.mobile.ui.components.StatusPill

private val STATUS_FILTERS = listOf("All", "Open", "In Progress", "Resolved", "Closed")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IssueListScreen(state: MainUiState, viewModel: MainViewModel) {
    val focusManager = LocalFocusManager.current
    var showSearch by remember { mutableStateOf(false) }
    var showOverflow by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val listState = rememberLazyListState()

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
                                viewModel.loadIssues()
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
        floatingActionButton = {
            if (!showSearch) {
                ExtendedFloatingActionButton(
                    onClick = viewModel::showCreateIssueDialog,
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("New Issue") },
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            ErrorBanner(state.errorMessage, viewModel::clearError)

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
            }
            HorizontalDivider(thickness = 0.5.dp)

            PullToRefreshBox(
                isRefreshing = state.isLoading,
                onRefresh = viewModel::loadIssues,
                modifier = Modifier.fillMaxSize(),
            ) {
                when {
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
                                        state.sortMode.label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                    )
                                }
                            }
                            items(state.issues, key = { it.id }) { issue ->
                                IssueRow(issue = issue, onClick = { viewModel.selectIssue(issue) })
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
private fun IssueRow(issue: Issue, onClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Text(issue.subject, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(end = 8.dp))
            Text(issue.displayId(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        issue.projectName?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { PriorityPill(it) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                issue.assignedToName?.let { AssigneeAvatar(it) }
                issue.dueDate?.let {
                    Text("Due ${it.formatDate()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
fun CreateIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    FormDialog(title = "Create Issue", onDismiss = viewModel::hideCreateIssueDialog, onConfirm = viewModel::createIssue, confirmLabel = "Create") {
        FormTextField("Subject", state.createSubject, viewModel::updateCreateSubject)
        FormTextField("Project ID", state.createProjectId, viewModel::updateCreateProjectId, numeric = true)
        FormTextField("Description", state.createDescription, viewModel::updateCreateDescription, minLines = 3)
        FormTextField("Priority ID", state.createPriorityId, viewModel::updateCreatePriorityId, numeric = true)
        FormTextField("Due date (YYYY-MM-DD)", state.createDueDate, viewModel::updateCreateDueDate)
    }
}
