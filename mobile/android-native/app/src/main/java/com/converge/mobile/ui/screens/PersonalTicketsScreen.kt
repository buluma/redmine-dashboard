package com.converge.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.converge.mobile.data.Issue
import com.converge.mobile.data.displayId
import com.converge.mobile.data.formatDate
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.components.EmptyState
import com.converge.mobile.ui.components.FormDialog
import com.converge.mobile.ui.components.FormTextField
import com.converge.mobile.ui.components.PriorityPill
import com.converge.mobile.ui.components.StatusPill

private val TRACKERS = listOf("Task", "Bug", "Feature", "Support")
private val PRIORITIES = listOf("Low", "Normal", "High", "Urgent")
private val LOCAL_STATUSES = listOf("New", "In Progress", "Resolved", "Closed")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonalTicketsScreen(state: MainUiState, viewModel: MainViewModel) {
    if (state.showLocalIssueDialog) LocalIssueDialog(state, viewModel)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Personal Tickets", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = viewModel::loadLocalIssues, enabled = !state.isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh personal tickets")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (state.localIssues.isEmpty()) {
                EmptyState("No personal tickets yet.")
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    item {
                        Text(
                            "${state.localIssues.size} personal ticket${if (state.localIssues.size != 1) "s" else ""}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        )
                    }
                    items(state.localIssues, key = { it.id }) { issue ->
                        PersonalTicketRow(issue = issue, onClick = { viewModel.selectIssue(issue) })
                        HorizontalDivider(thickness = 0.5.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonalTicketRow(issue: Issue, onClick: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Text(issue.subject, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(end = 8.dp))
            Text(issue.displayId(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusPill(issue.statusName)
                issue.priority?.takeIf { it.isNotBlank() }?.let { PriorityPill(it) }
            }
            issue.dueDate?.let {
                Text("Due ${it.formatDate()}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        issue.description?.takeIf { it.isNotBlank() }?.let {
            Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun LocalIssueDialog(state: MainUiState, viewModel: MainViewModel) {
    val editing = state.editingLocalIssueId != null
    FormDialog(
        title = if (editing) "Edit Personal Ticket" else "Create Personal Ticket",
        onDismiss = viewModel::hideLocalIssueDialog,
        onConfirm = viewModel::saveLocalIssue,
        confirmLabel = if (editing) "Save" else "Create",
    ) {
        FormTextField("Subject", state.localSubject, viewModel::updateLocalSubject)
        FormTextField("Description", state.localDescription, viewModel::updateLocalDescription, minLines = 4)
        Text("Tracker", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ChipRow(TRACKERS, state.localTracker, viewModel::updateLocalTracker)
        Text("Priority", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ChipRow(PRIORITIES, state.localPriority, viewModel::updateLocalPriority)
        Text("Status", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ChipRow(LOCAL_STATUSES, state.localStatusName, viewModel::updateLocalStatusName)
        FormTextField("Due date (YYYY-MM-DD)", state.localDueDate, viewModel::updateLocalDueDate)
        FormTextField("Estimate hours", state.localEstimate, viewModel::updateLocalEstimate, numeric = true)
        FormTextField("Done ratio (0-100)", state.localDoneRatio, viewModel::updateLocalDoneRatio, numeric = true)
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ChipRow(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { option ->
            FilterChip(
                selected = selected == option,
                onClick = { onSelect(option) },
                label = { Text(option, style = MaterialTheme.typography.labelSmall) },
            )
        }
    }
}
