package com.nrcc.mobile.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nrcc.mobile.data.CreateGithubLinkRequest

@Composable
fun PairScreen(
    viewModel: PairViewModel,
    onPaired: () -> Unit
) {
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    var redmineBaseUrl by remember { mutableStateOf("") }
    var redmineApiKey by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf("Android Device") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Pair Android with NRCC", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = redmineBaseUrl,
            onValueChange = { redmineBaseUrl = it },
            label = { Text("Redmine Base URL") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = redmineApiKey,
            onValueChange = { redmineApiKey = it },
            label = { Text("Redmine API Key") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = deviceName,
            onValueChange = { deviceName = it },
            label = { Text("Device Name") },
            modifier = Modifier.fillMaxWidth()
        )
        Button(
            enabled = !loading,
            onClick = {
                viewModel.pair(
                    baseUrl = redmineBaseUrl.trim(),
                    redmineApiKey = redmineApiKey.trim(),
                    deviceName = deviceName.trim().ifBlank { null },
                    onPaired = onPaired
                )
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (loading) "Pairing..." else "Pair and Continue")
        }
        if (!error.isNullOrBlank()) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
fun IssueListScreen(
    viewModel: IssuesViewModel,
    onIssueSelected: (Int) -> Unit
) {
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val issues by viewModel.issues.collectAsState()
    var search by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("My Issues", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.weight(1f),
                label = { Text("Search") }
            )
            Button(onClick = { viewModel.loadIssues(search) }) {
                Text("Load")
            }
        }
        Spacer(Modifier.height(8.dp))
        if (!error.isNullOrBlank()) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        if (loading) {
            Text("Loading issues...")
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(issues) { issue ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onIssueSelected(issue.redmineIssueId) }
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text("#${issue.redmineIssueId} ${issue.subject}", fontWeight = FontWeight.SemiBold)
                        Text("Status: ${issue.statusName} • Priority: ${issue.priority ?: "-"}")
                        Text("GitHub Links: ${issue.githubLinks.size}")
                    }
                }
            }
        }
    }
}

@Composable
fun IssueDetailScreen(
    issueId: Int,
    viewModel: IssueDetailViewModel
) {
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val issue by viewModel.issue.collectAsState()

    var comment by remember { mutableStateOf("") }
    var repo by remember { mutableStateOf("") }
    var ghIssue by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Button(onClick = { viewModel.load(issueId) }) {
            Text("Refresh")
        }
        if (loading) {
            Text("Loading issue...")
        }
        if (!error.isNullOrBlank()) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }

        issue?.let { current ->
            Text("#${current.redmineIssueId} ${current.subject}", style = MaterialTheme.typography.headlineSmall)
            Text("Status: ${current.statusName}")
            Text(current.description ?: "(No description)")

            Spacer(Modifier.height(8.dp))
            Text("Post Comment", fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = comment,
                onValueChange = { comment = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Comment") }
            )
            Button(
                onClick = {
                    if (comment.isNotBlank()) {
                        viewModel.postComment(current.redmineIssueId, comment.trim())
                        comment = ""
                    }
                }
            ) {
                Text("Submit Comment")
            }

            Spacer(Modifier.height(8.dp))
            Text("Add GitHub Link", fontWeight = FontWeight.SemiBold)
            OutlinedTextField(
                value = repo,
                onValueChange = { repo = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Repository (owner/repo)") }
            )
            OutlinedTextField(
                value = ghIssue,
                onValueChange = { ghIssue = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Issue Number (optional)") }
            )
            Button(
                onClick = {
                    if (repo.isNotBlank()) {
                        viewModel.addGithubLink(
                            issueId = current.redmineIssueId,
                            request = CreateGithubLinkRequest(
                                repositoryFullName = repo.trim(),
                                githubIssueNumber = ghIssue.toIntOrNull()
                            )
                        )
                        repo = ""
                        ghIssue = ""
                    }
                }
            ) {
                Text("Add Link")
            }

            Spacer(Modifier.height(8.dp))
            Text("GitHub Links", fontWeight = FontWeight.SemiBold)
            current.githubLinks.forEach { link ->
                Card(Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(link.title ?: link.url)
                            Text(link.repositoryFullName)
                        }
                        Button(onClick = { viewModel.removeGithubLink(current.redmineIssueId, link.id) }) {
                            Text("Remove")
                        }
                    }
                }
            }
        }
    }
}
