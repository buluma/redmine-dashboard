package com.converge.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.converge.mobile.BuildConfig
import com.converge.mobile.data.Activity
import com.converge.mobile.data.ApiException
import com.converge.mobile.data.AssignableUser
import com.converge.mobile.data.IssueListResponse
import com.converge.mobile.data.displayId
import com.converge.mobile.data.AiCategorizeResponse
import com.converge.mobile.data.AiSummaryResponse
import com.converge.mobile.data.ConvergeRepository
import com.converge.mobile.data.InternalNote
import com.converge.mobile.data.Issue
import com.converge.mobile.data.SecureTokenStore
import kotlinx.coroutines.launch
import java.time.LocalDate

enum class MainTab { ISSUES, FAVORITES, SETTINGS }

enum class SortMode(val label: String, val apiValue: String) {
    UPDATED_DESC("Recent", "updated_desc"),
    UPDATED_ASC("Oldest", "updated_asc"),
    PRIORITY("Priority", "priority"),
    DUE_DATE("Due Date", "due_date"),
}

data class MainUiState(
    val serverUrl: String = BuildConfig.DEFAULT_SERVER_URL,
    val redmineBaseUrl: String = "",
    val redmineApiKey: String = "",
    val deviceName: String = "Converge-Compose",
    val search: String = "",
    val statusFilter: String = "All",
    val sortMode: SortMode = SortMode.UPDATED_DESC,
    val currentTab: MainTab = MainTab.ISSUES,
    val page: Int = 1,
    val totalIssues: Int = 0,
    val isLoadingMore: Boolean = false,
    val isOffline: Boolean = false,
    val commentDraft: String = "",
    val isPaired: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val issues: List<Issue> = emptyList(),
    val selectedIssue: Issue? = null,
    val assignableUsers: List<AssignableUser> = emptyList(),
    val activities: List<Activity> = emptyList(),
    val internalNotes: List<InternalNote> = emptyList(),
    val aiSummary: AiSummaryResponse? = null,
    val aiCategorization: AiCategorizeResponse? = null,
    val actionMessage: String? = null,
    val showCreateIssueDialog: Boolean = false,
    val showEditIssueDialog: Boolean = false,
    val showAssignSheet: Boolean = false,
    val showTimeDialog: Boolean = false,
    val showInternalNoteDialog: Boolean = false,
    val showGithubDialog: Boolean = false,
    val createSubject: String = "",
    val createProjectId: String = "",
    val createDescription: String = "",
    val createPriorityId: String = "",
    val createDueDate: String = "",
    val editSubject: String = "",
    val editDescription: String = "",
    val editPriority: String = "",
    val editDueDate: String = "",
    val editStartDate: String = "",
    val editEstimate: String = "",
    val timeHours: String = "",
    val timeActivityId: String = "",
    val timeComment: String = "",
    val timeSpentOn: String = LocalDate.now().toString(),
    val internalNoteDraft: String = "",
    val githubRepository: String = "",
    val githubIssueNumber: String = "",
    val githubPrNumber: String = "",
    val githubUrl: String = "",
    val githubTitle: String = "",
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = ConvergeRepository(SecureTokenStore(application))

    var state = androidx.compose.runtime.mutableStateOf(
        MainUiState(
            serverUrl = repository.savedServerUrl(BuildConfig.DEFAULT_SERVER_URL),
            isPaired = repository.hasToken(),
        ),
    )
        private set

    init {
        if (state.value.isPaired) {
            loadIssues()
        }
    }

    fun updateServerUrl(value: String) = update { copy(serverUrl = value) }
    fun updateRedmineBaseUrl(value: String) = update { copy(redmineBaseUrl = value) }
    fun updateRedmineApiKey(value: String) = update { copy(redmineApiKey = value) }
    fun updateDeviceName(value: String) = update { copy(deviceName = value) }
    fun updateSearch(value: String) = update { copy(search = value) }
    fun updateStatusFilter(value: String) {
        update { copy(statusFilter = value) }
        loadIssues()
    }
    fun updateSortMode(mode: SortMode) {
        update { copy(sortMode = mode) }
        loadIssues()
    }
    fun switchTab(tab: MainTab) = update { copy(currentTab = tab) }
    fun setOffline(offline: Boolean) = update { copy(isOffline = offline) }
    fun updateCommentDraft(value: String) = update { copy(commentDraft = value) }
    fun updateCreateSubject(value: String) = update { copy(createSubject = value) }
    fun updateCreateProjectId(value: String) = update { copy(createProjectId = value) }
    fun updateCreateDescription(value: String) = update { copy(createDescription = value) }
    fun updateCreatePriorityId(value: String) = update { copy(createPriorityId = value) }
    fun updateCreateDueDate(value: String) = update { copy(createDueDate = value) }
    fun updateEditSubject(value: String) = update { copy(editSubject = value) }
    fun updateEditDescription(value: String) = update { copy(editDescription = value) }
    fun updateEditPriority(value: String) = update { copy(editPriority = value) }
    fun updateEditDueDate(value: String) = update { copy(editDueDate = value) }
    fun updateEditStartDate(value: String) = update { copy(editStartDate = value) }
    fun updateEditEstimate(value: String) = update { copy(editEstimate = value) }
    fun updateTimeHours(value: String) = update { copy(timeHours = value) }
    fun updateTimeActivityId(value: String) = update { copy(timeActivityId = value) }
    fun updateTimeComment(value: String) = update { copy(timeComment = value) }
    fun updateTimeSpentOn(value: String) = update { copy(timeSpentOn = value) }
    fun updateInternalNoteDraft(value: String) = update { copy(internalNoteDraft = value) }
    fun updateGithubRepository(value: String) = update { copy(githubRepository = value) }
    fun updateGithubIssueNumber(value: String) = update { copy(githubIssueNumber = value) }
    fun updateGithubPrNumber(value: String) = update { copy(githubPrNumber = value) }
    fun updateGithubUrl(value: String) = update { copy(githubUrl = value) }
    fun updateGithubTitle(value: String) = update { copy(githubTitle = value) }
    fun clearError() = update { copy(errorMessage = null) }
    fun clearActionMessage() = update { copy(actionMessage = null) }

    fun showCreateIssueDialog() = update { copy(showCreateIssueDialog = true) }
    fun hideCreateIssueDialog() = update { copy(showCreateIssueDialog = false) }
    fun hideEditIssueDialog() = update { copy(showEditIssueDialog = false) }
    fun hideAssignSheet() = update { copy(showAssignSheet = false) }
    fun hideTimeDialog() = update { copy(showTimeDialog = false) }
    fun hideInternalNoteDialog() = update { copy(showInternalNoteDialog = false) }
    fun hideGithubDialog() = update { copy(showGithubDialog = false) }

    fun pairDevice() {
        val current = state.value
        if (current.serverUrl.isBlank() || current.redmineBaseUrl.isBlank() || current.redmineApiKey.isBlank()) {
            update { copy(errorMessage = "Server URL, Redmine URL, and API key are required.") }
            return
        }

        viewModelScope.launch {
            runBusy {
                repository.pair(
                    serverUrl = current.serverUrl,
                    redmineBaseUrl = current.redmineBaseUrl,
                    redmineApiKey = current.redmineApiKey,
                    deviceName = current.deviceName,
                )
                update {
                    copy(
                        isPaired = true,
                        redmineApiKey = "",
                        issues = emptyList(),
                        selectedIssue = null,
                    )
                }
                loadIssues()
            }
        }
    }

    fun loadIssues() {
        viewModelScope.launch {
            runBusy {
                val status = state.value.statusFilter.takeIf { it != "All" }
                val response = repository.listIssues(state.value.serverUrl, state.value.search, status, state.value.sortMode.apiValue, 1)
                update { copy(issues = response.items, page = 1, totalIssues = response.total) }
            }
        }
    }

    fun loadMoreIssues() {
        val current = state.value
        if (current.isLoadingMore || current.isLoading || current.issues.size >= current.totalIssues) return
        viewModelScope.launch {
            update { copy(isLoadingMore = true) }
            try {
                val status = current.statusFilter.takeIf { it != "All" }
                val response = repository.listIssues(current.serverUrl, current.search, status, current.sortMode.apiValue, current.page + 1)
                update { copy(issues = issues + response.items, page = page + 1, totalIssues = response.total, isLoadingMore = false) }
            } catch (e: Exception) {
                update { copy(isLoadingMore = false, errorMessage = e.message ?: "Failed to load more") }
            }
        }
    }

    fun selectIssue(issue: Issue) {
        viewModelScope.launch {
            runBusy {
                val id = issue.redmineIssueId?.toString() ?: issue.id
                val detail = repository.getIssue(state.value.serverUrl, id)
                val enriched = repository.refreshIssueLists(state.value.serverUrl, detail)
                val notes = detail.redmineIssueId?.let {
                    runCatching { repository.listInternalNotes(state.value.serverUrl, it) }.getOrElse { emptyList() }
                } ?: emptyList()
                update { copy(selectedIssue = enriched, internalNotes = notes, commentDraft = "", aiSummary = null, aiCategorization = null) }
            }
        }
    }

    fun backToList() {
        update { copy(selectedIssue = null, commentDraft = "", internalNotes = emptyList(), aiSummary = null, aiCategorization = null) }
    }

    fun createIssue() {
        val projectId = state.value.createProjectId.toIntOrNull()
        val priorityId = state.value.createPriorityId.toIntOrNull()
        if (state.value.createSubject.isBlank() || projectId == null) {
            update { copy(errorMessage = "Subject and numeric project ID are required.") }
            return
        }

        viewModelScope.launch {
            runBusy {
                val issue = repository.createIssue(
                    serverUrl = state.value.serverUrl,
                    subject = state.value.createSubject,
                    description = state.value.createDescription,
                    projectId = projectId,
                    priorityId = priorityId,
                    assignedToId = null,
                    dueDate = state.value.createDueDate,
                )
                val status = state.value.statusFilter.takeIf { it != "All" }
                val listResponse = repository.listIssues(state.value.serverUrl, state.value.search, status, state.value.sortMode.apiValue, 1)
                update {
                    copy(
                        issues = listResponse.items,
                        page = 1,
                        totalIssues = listResponse.total,
                        selectedIssue = issue,
                        showCreateIssueDialog = false,
                        createSubject = "",
                        createProjectId = "",
                        createDescription = "",
                        createPriorityId = "",
                        createDueDate = "",
                        actionMessage = "Created ${issue.displayId()}",
                    )
                }
            }
        }
    }

    fun openEditIssueDialog() {
        val issue = state.value.selectedIssue ?: return
        update {
            copy(
                showEditIssueDialog = true,
                editSubject = issue.subject,
                editDescription = issue.description.orEmpty(),
                editPriority = issue.priority.orEmpty(),
                editDueDate = issue.dueDate.orEmpty(),
                editStartDate = issue.startDate.orEmpty(),
                editEstimate = issue.estimatedHours?.toString().orEmpty(),
            )
        }
    }

    fun saveIssueEdits() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId
        if (redmineIssueId == null) {
            update { copy(errorMessage = "Local-only issues cannot sync edits to Redmine.") }
            return
        }

        viewModelScope.launch {
            runBusy {
                repository.editIssue(
                    serverUrl = state.value.serverUrl,
                    redmineIssueId = redmineIssueId,
                    subject = state.value.editSubject,
                    description = state.value.editDescription,
                    priority = state.value.editPriority,
                    dueDate = state.value.editDueDate,
                    startDate = state.value.editStartDate,
                    estimatedHours = state.value.editEstimate.toDoubleOrNull(),
                )
                refreshSelectedIssue(actionMessage = "Issue updated")
                update { copy(showEditIssueDialog = false) }
            }
        }
    }

    fun toggleFavorite() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        viewModelScope.launch {
            runBusy {
                val favorited = repository.toggleFavorite(state.value.serverUrl, redmineIssueId)
                refreshSelectedIssue(actionMessage = if (favorited) "Added to favorites" else "Removed from favorites")
            }
        }
    }

    fun openAssignSheet() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId
        if (redmineIssueId == null) {
            update { copy(errorMessage = "Local-only issues cannot be assigned through Redmine.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                val users = repository.listAssignableUsers(state.value.serverUrl)
                update { copy(assignableUsers = users, showAssignSheet = true) }
            }
        }
    }

    fun assignIssue(userId: Int) {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        viewModelScope.launch {
            runBusy {
                repository.assignIssue(state.value.serverUrl, redmineIssueId, userId)
                refreshSelectedIssue(actionMessage = "Issue assigned")
                update { copy(showAssignSheet = false) }
            }
        }
    }

    fun openTimeDialog() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId
        if (redmineIssueId == null) {
            update { copy(errorMessage = "Local-only issues cannot sync time to Redmine.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                val activities = repository.listActivities(state.value.serverUrl)
                update {
                    copy(
                        activities = activities,
                        showTimeDialog = true,
                        timeActivityId = activities.firstOrNull()?.id?.toString().orEmpty(),
                        timeSpentOn = LocalDate.now().toString(),
                    )
                }
            }
        }
    }

    fun createTimeEntry() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        val hours = state.value.timeHours.toDoubleOrNull()
        val activityId = state.value.timeActivityId.toIntOrNull()
        if (hours == null || activityId == null) {
            update { copy(errorMessage = "Hours and numeric activity ID are required.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                repository.createTimeEntry(
                    serverUrl = state.value.serverUrl,
                    redmineIssueId = redmineIssueId,
                    hours = hours,
                    activityId = activityId,
                    comment = state.value.timeComment,
                    spentOn = state.value.timeSpentOn,
                )
                refreshSelectedIssue(actionMessage = "Time logged")
                update { copy(showTimeDialog = false, timeHours = "", timeComment = "") }
            }
        }
    }

    fun deleteTimeEntry(redmineTimeEntryId: Int) {
        viewModelScope.launch {
            runBusy {
                repository.deleteTimeEntry(state.value.serverUrl, redmineTimeEntryId)
                refreshSelectedIssue(actionMessage = "Time entry deleted")
            }
        }
    }

    fun openInternalNoteDialog() = update { copy(showInternalNoteDialog = true) }

    fun createInternalNote() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        if (state.value.internalNoteDraft.isBlank()) {
            update { copy(errorMessage = "Internal note cannot be empty.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                repository.createInternalNote(state.value.serverUrl, redmineIssueId, state.value.internalNoteDraft)
                val notes = repository.listInternalNotes(state.value.serverUrl, redmineIssueId)
                update {
                    copy(
                        internalNotes = notes,
                        showInternalNoteDialog = false,
                        internalNoteDraft = "",
                        actionMessage = "Internal note added",
                    )
                }
            }
        }
    }

    fun deleteInternalNote(noteId: String) {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        viewModelScope.launch {
            runBusy {
                repository.deleteInternalNote(state.value.serverUrl, redmineIssueId, noteId)
                val notes = repository.listInternalNotes(state.value.serverUrl, redmineIssueId)
                update { copy(internalNotes = notes, actionMessage = "Note deleted") }
            }
        }
    }

    fun openGithubDialog() = update { copy(showGithubDialog = true) }

    fun addGithubLink() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        viewModelScope.launch {
            runBusy {
                repository.addGithubLink(
                    serverUrl = state.value.serverUrl,
                    redmineIssueId = redmineIssueId,
                    repositoryFullName = state.value.githubRepository,
                    githubIssueNumber = state.value.githubIssueNumber.toIntOrNull(),
                    githubPrNumber = state.value.githubPrNumber.toIntOrNull(),
                    url = state.value.githubUrl,
                    title = state.value.githubTitle,
                )
                refreshSelectedIssue(actionMessage = "GitHub link added")
                update {
                    copy(
                        showGithubDialog = false,
                        githubRepository = "",
                        githubIssueNumber = "",
                        githubPrNumber = "",
                        githubUrl = "",
                        githubTitle = "",
                    )
                }
            }
        }
    }

    fun removeGithubLink(linkId: String) {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        viewModelScope.launch {
            runBusy {
                repository.removeGithubLink(state.value.serverUrl, redmineIssueId, linkId)
                refreshSelectedIssue(actionMessage = "GitHub link removed")
            }
        }
    }

    fun summarizeIssue() {
        val issue = state.value.selectedIssue ?: return
        val id = issue.redmineIssueId?.toString() ?: issue.id
        viewModelScope.launch {
            runBusy {
                val summary = repository.summarizeIssue(state.value.serverUrl, id)
                update { copy(aiSummary = summary, actionMessage = "AI summary ready") }
            }
        }
    }

    fun categorizeIssue() {
        val issue = state.value.selectedIssue ?: return
        val id = issue.redmineIssueId?.toString() ?: issue.id
        viewModelScope.launch {
            runBusy {
                val categorization = repository.categorizeIssue(state.value.serverUrl, id)
                update { copy(aiCategorization = categorization, actionMessage = "AI categorization ready") }
            }
        }
    }

    fun rotateToken() {
        viewModelScope.launch {
            runBusy {
                repository.rotateToken(state.value.serverUrl)
                update { copy(actionMessage = "Mobile token rotated") }
            }
        }
    }

    fun postComment() {
        val issue = state.value.selectedIssue ?: return
        val comment = state.value.commentDraft.trim()
        if (comment.isBlank()) {
            update { copy(errorMessage = "Comment cannot be empty.") }
            return
        }
        if (issue.redmineIssueId == null) {
            update { copy(errorMessage = "Local-only issues cannot be commented from mobile yet.") }
            return
        }

        viewModelScope.launch {
            runBusy {
                repository.postComment(state.value.serverUrl, issue.redmineIssueId.toString(), comment)
                refreshSelectedIssue(actionMessage = "Comment posted")
                update { copy(commentDraft = "") }
            }
        }
    }

    fun updateStatus(statusId: Int) {
        val issue = state.value.selectedIssue ?: return
        val redmineIssueId = issue.redmineIssueId
        if (redmineIssueId == null) {
            update { copy(errorMessage = "Local-only issues cannot sync status changes to Redmine.") }
            return
        }

        viewModelScope.launch {
            runBusy {
                repository.updateStatus(state.value.serverUrl, redmineIssueId, statusId)
                refreshSelectedIssue(actionMessage = "Status updated")
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runBusy {
                repository.logout(state.value.serverUrl)
                update {
                    copy(
                        isPaired = false,
                        issues = emptyList(),
                        selectedIssue = null,
                        commentDraft = "",
                        internalNotes = emptyList(),
                        actionMessage = "Logged out",
                    )
                }
            }
        }
    }

    private suspend fun refreshSelectedIssue(actionMessage: String? = null) {
        val current = state.value.selectedIssue ?: return
        val id = current.redmineIssueId?.toString() ?: current.id
        val refreshed = repository.refreshIssueLists(state.value.serverUrl, repository.getIssue(state.value.serverUrl, id))
        val status = state.value.statusFilter.takeIf { it != "All" }
        val response = repository.listIssues(state.value.serverUrl, state.value.search, status, state.value.sortMode.apiValue, 1)
        val notes = refreshed.redmineIssueId?.let {
            runCatching { repository.listInternalNotes(state.value.serverUrl, it) }.getOrElse { state.value.internalNotes }
        } ?: state.value.internalNotes
        update { copy(selectedIssue = refreshed, issues = response.items, page = 1, totalIssues = response.total, internalNotes = notes, actionMessage = actionMessage) }
    }

    private suspend fun runBusy(block: suspend () -> Unit) {
        update { copy(isLoading = true, errorMessage = null) }
        try {
            block()
        } catch (error: ApiException) {
            updateForError(error.message ?: "Request failed.")
        } catch (error: Exception) {
            updateForError(error.message ?: "Unexpected error.")
        } finally {
            update { copy(isLoading = false) }
        }
    }

    private fun updateForError(message: String) {
        val sessionExpired = message.contains("Session expired", ignoreCase = true)
        update {
            copy(
                errorMessage = message,
                isPaired = if (sessionExpired) false else isPaired,
                issues = if (sessionExpired) emptyList() else issues,
                selectedIssue = if (sessionExpired) null else selectedIssue,
                actionMessage = null,
            )
        }
    }

    private fun update(block: MainUiState.() -> MainUiState) {
        state.value = state.value.block()
    }
}
