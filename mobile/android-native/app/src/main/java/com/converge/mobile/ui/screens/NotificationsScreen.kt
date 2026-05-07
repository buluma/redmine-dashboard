package com.converge.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.converge.mobile.data.NotificationItem
import com.converge.mobile.data.formatDate
import com.converge.mobile.ui.MainUiState
import com.converge.mobile.ui.MainViewModel
import com.converge.mobile.ui.components.EmptyState
import com.converge.mobile.ui.components.ErrorBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(state: MainUiState, viewModel: MainViewModel) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.SemiBold) },
                actions = {
                    IconButton(onClick = viewModel::loadNotifications, enabled = !state.isLoading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            ErrorBanner(state.errorMessage, viewModel::clearError)
            if (state.notifications.isEmpty()) {
                EmptyState("No notifications.")
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Text(
                            "${state.unreadNotifications} unread",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        )
                    }
                    items(state.notifications, key = { it.id }) { item ->
                        NotificationCard(
                            item = item,
                            onClick = item.issueId?.let { id -> { viewModel.selectIssueById(id) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(item: NotificationItem, onClick: (() -> Unit)?) {
    val icon = notificationIcon(item.type)
    val color = notificationColor(item.type)
    Card(
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, tint = color)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(item.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Text(item.timestamp.formatDate(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(item.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private fun notificationIcon(type: String): ImageVector = when (type.lowercase()) {
    "error" -> Icons.Default.Error
    "warning" -> Icons.Default.Warning
    else -> Icons.Default.Info
}

@Composable
private fun notificationColor(type: String) = when (type.lowercase()) {
    "error" -> MaterialTheme.colorScheme.error
    "warning" -> MaterialTheme.colorScheme.tertiary
    else -> MaterialTheme.colorScheme.primary
}
