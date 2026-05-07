package com.converge.mobile.ui

import android.app.Application
import android.app.DownloadManager
import android.net.Uri
import android.os.Environment
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
import com.converge.mobile.data.CatalogPriority
import com.converge.mobile.data.CatalogProject
import com.converge.mobile.data.CatalogStatus
import com.converge.mobile.data.CatalogTracker
import com.converge.mobile.data.ConvergeRepository
import com.converge.mobile.data.InternalNote
import com.converge.mobile.data.Issue
import com.converge.mobile.data.IssueAttachment
import com.converge.mobile.data.IssueRelation
import com.converge.mobile.data.Journal
import com.converge.mobile.data.TimeEntry
import com.converge.mobile.data.NotificationItem
import com.converge.mobile.data.SavedIssueView
import com.converge.mobile.data.SecureTokenStore
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.util.UUID

enum class MainTab { ISSUES, PERSONAL, FAVORITES, NOTIFICATIONS, SETTINGS }

enum class SortMode(val label: String, val apiValue: String) {
    UPDATED_DESC("Recent", "updated_desc"),
    UPDATED_ASC("Oldest", "updated_asc"),
    PRIORITY("Priority", "priority"),
    DUE_DATE("Due Date", "due_date"),
}

enum class SearchMode(val label: String, val apiValue: String) {
    LOCAL("Local", "local"),
    HYBRID("Hybrid", "hybrid"),
    REMOTE("Remote", "remote"),
}

data class MainUiState(
    val serverUrl: String = BuildConfig.DEFAULT_SERVER_URL,
    val redmineBaseUrl: String = "",
    val redmineApiKey: String = "",
    val deviceName: String = "Converge-Compose",
    val search: String = "",
    val statusFilter: String = "All",
    val priorityFilter: String = "All",
    val projectFilter: String = "All",
    val searchMode: SearchMode = SearchMode.LOCAL,
    val openOnly: Boolean = false,
    val sortMode: SortMode = SortMode.UPDATED_DESC,
    val compactList: Boolean = false,
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
    val localIssues: List<Issue> = emptyList(),
    val favoriteIssues: List<Issue> = emptyList(),
    val selectedIssue: Issue? = null,
    val assignableUsers: List<AssignableUser> = emptyList(),
    val activities: List<Activity> = emptyList(),
    val catalogStatuses: List<CatalogStatus> = emptyList(),
    val catalogPriorities: List<CatalogPriority> = emptyList(),
    val catalogProjects: List<CatalogProject> = emptyList(),
    val catalogTrackers: List<CatalogTracker> = emptyList(),
    val internalNotes: List<InternalNote> = emptyList(),
    val journals: List<Journal> = emptyList(),
    val notifications: List<NotificationItem> = emptyList(),
    val unreadNotifications: Int = 0,
    val aiSummary: AiSummaryResponse? = null,
    val aiCategorization: AiCategorizeResponse? = null,
    val savedViews: List<SavedIssueView> = emptyList(),
    val savedViewName: String = "",
    val activeSavedViewId: String? = null,
    val actionMessage: String? = null,
    val showCreateIssueDialog: Boolean = false,
    val showEditIssueDialog: Boolean = false,
    val showAssignSheet: Boolean = false,
    val showTimeDialog: Boolean = false,
    val showInternalNoteDialog: Boolean = false,
    val showGithubDialog: Boolean = false,
    val showRelationDialog: Boolean = false,
    val showLocalIssueDialog: Boolean = false,
    val editingLocalIssueId: String? = null,
    val createSubject: String = "",
    val createProjectId: String = "",
    val createDescription: String = "",
    val createPriorityId: String = "",
    val createTrackerId: String = "",
    val createDueDate: String = "",
    val editSubject: String = "",
    val editDescription: String = "",
    val editPriorityId: String = "",
    val editTrackerId: String = "",
    val editDueDate: String = "",
    val editStartDate: String = "",
    val editEstimate: String = "",
    val timeHours: String = "",
    val timeActivityId: String = "",
    val timeComment: String = "",
    val timeSpentOn: String = LocalDate.now().toString(),
    val editingTimeEntryId: Int? = null,
    val internalNoteDraft: String = "",
    val relationTargetId: String = "",
    val relationType: String = "relates",
    val localSubject: String = "",
    val localDescription: String = "",
    val localTracker: String = "Task",
    val localPriority: String = "Normal",
    val localStatusName: String = "New",
    val localDueDate: String = "",
    val localEstimate: String = "",
    val localDoneRatio: String = "0",
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
            savedViews = repository.savedIssueViews(),
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
    fun updateSearch(value: String) = update { copy(search = value, activeSavedViewId = null) }
    fun updateStatusFilter(value: String) {
        update { copy(statusFilter = value, activeSavedViewId = null) }
        loadIssues()
    }
    fun updatePriorityFilter(value: String) {
        update { copy(priorityFilter = value, activeSavedViewId = null) }
        loadIssues()
    }
    fun updateProjectFilter(value: String) {
        update { copy(projectFilter = value, activeSavedViewId = null) }
        loadIssues()
    }
    fun updateSearchMode(mode: SearchMode) {
        update { copy(searchMode = mode, activeSavedViewId = null) }
        loadIssues()
    }
    fun toggleOpenOnly() {
        update { copy(openOnly = !openOnly, activeSavedViewId = null) }
        loadIssues()
    }
    fun updateSortMode(mode: SortMode) {
        update { copy(sortMode = mode, activeSavedViewId = null) }
        loadIssues()
    }
    fun toggleCompactList() = update { copy(compactList = !compactList, activeSavedViewId = null) }
    fun updateSavedViewName(value: String) = update { copy(savedViewName = value) }
    fun switchTab(tab: MainTab) {
        update { copy(currentTab = tab) }
        when (tab) {
            MainTab.PERSONAL -> loadLocalIssues()
            MainTab.FAVORITES -> loadFavorites()
            MainTab.NOTIFICATIONS -> loadNotifications()
            else -> Unit
        }
    }
    fun setOffline(offline: Boolean) = update { copy(isOffline = offline) }
    fun updateCommentDraft(value: String) = update { copy(commentDraft = value) }
    fun updateCreateSubject(value: String) = update { copy(createSubject = value) }
    fun updateCreateProjectId(value: String) = update { copy(createProjectId = value) }
    fun updateCreateDescription(value: String) = update { copy(createDescription = value) }
    fun updateCreatePriorityId(value: String) = update { copy(createPriorityId = value) }
    fun updateCreateTrackerId(value: String) = update { copy(createTrackerId = value) }
    fun updateCreateDueDate(value: String) = update { copy(createDueDate = value) }
    fun updateEditSubject(value: String) = update { copy(editSubject = value) }
    fun updateEditDescription(value: String) = update { copy(editDescription = value) }
    fun updateEditPriorityId(value: String) = update { copy(editPriorityId = value) }
    fun updateEditTrackerId(value: String) = update { copy(editTrackerId = value) }
    fun updateEditDueDate(value: String) = update { copy(editDueDate = value) }
    fun updateEditStartDate(value: String) = update { copy(editStartDate = value) }
    fun updateEditEstimate(value: String) = update { copy(editEstimate = value) }
    fun updateTimeHours(value: String) = update { copy(timeHours = value) }
    fun updateTimeActivityId(value: String) = update { copy(timeActivityId = value) }
    fun updateTimeComment(value: String) = update { copy(timeComment = value) }
    fun updateTimeSpentOn(value: String) = update { copy(timeSpentOn = value) }
    fun updateInternalNoteDraft(value: String) = update { copy(internalNoteDraft = value) }
    fun updateRelationTargetId(value: String) = update { copy(relationTargetId = value) }
    fun updateRelationType(value: String) = update { copy(relationType = value) }
    fun updateLocalSubject(value: String) = update { copy(localSubject = value) }
    fun updateLocalDescription(value: String) = update { copy(localDescription = value) }
    fun updateLocalTracker(value: String) = update { copy(localTracker = value) }
    fun updateLocalPriority(value: String) = update { copy(localPriority = value) }
    fun updateLocalStatusName(value: String) = update { copy(localStatusName = value) }
    fun updateLocalDueDate(value: String) = update { copy(localDueDate = value) }
    fun updateLocalEstimate(value: String) = update { copy(localEstimate = value) }
    fun updateLocalDoneRatio(value: String) = update { copy(localDoneRatio = value) }
    fun updateGithubRepository(value: String) = update { copy(githubRepository = value) }
    fun updateGithubIssueNumber(value: String) = update { copy(githubIssueNumber = value) }
    fun updateGithubPrNumber(value: String) = update { copy(githubPrNumber = value) }
    fun updateGithubUrl(value: String) = update { copy(githubUrl = value) }
    fun updateGithubTitle(value: String) = update { copy(githubTitle = value) }
    fun clearError() = update { copy(errorMessage = null) }
    fun clearActionMessage() = update { copy(actionMessage = null) }

    fun showCreateIssueDialog() {
        loadCatalogs()
        update { copy(showCreateIssueDialog = true) }
    }
    fun hideCreateIssueDialog() = update { copy(showCreateIssueDialog = false) }
    fun hideEditIssueDialog() = update { copy(showEditIssueDialog = false) }
    fun hideAssignSheet() = update { copy(showAssignSheet = false) }
    fun hideTimeDialog() = update { copy(showTimeDialog = false, editingTimeEntryId = null) }
    fun hideInternalNoteDialog() = update { copy(showInternalNoteDialog = false) }
    fun hideGithubDialog() = update { copy(showGithubDialog = false) }
    fun hideRelationDialog() = update { copy(showRelationDialog = false) }
    fun hideLocalIssueDialog() = update { copy(showLocalIssueDialog = false, editingLocalIssueId = null) }

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
                val priority = state.value.priorityFilter.takeIf { it != "All" }
                val project = state.value.projectFilter.takeIf { it != "All" }
                val response = repository.listIssues(
                    serverUrl = state.value.serverUrl,
                    search = state.value.search,
                    status = status,
                    priority = priority,
                    project = project,
                    searchMode = state.value.searchMode.apiValue,
                    openOnly = state.value.openOnly,
                    sort = state.value.sortMode.apiValue,
                    page = 1,
                    pageSize = if (state.value.compactList) 50 else 25,
                )
                update { copy(issues = response.items, page = 1, totalIssues = response.total) }
            }
        }
    }

    fun loadNotifications() {
        viewModelScope.launch {
            runBusy {
                val response = repository.listNotifications(state.value.serverUrl)
                update { copy(notifications = response.notifications, unreadNotifications = response.unreadCount) }
            }
        }
    }

    fun loadLocalIssues() {
        viewModelScope.launch {
            runBusy {
                val response = repository.listLocalIssues(state.value.serverUrl)
                update { copy(localIssues = response.items) }
            }
        }
    }

    fun loadCatalogs() {
        viewModelScope.launch {
            runCatching {
                val catalogs = repository.getCatalogs(state.value.serverUrl)
                update {
                    copy(
                        catalogStatuses = catalogs.statuses,
                        catalogPriorities = catalogs.priorities,
                        catalogProjects = catalogs.projects,
                        catalogTrackers = catalogs.trackers,
                    )
                }
            }
        }
    }

    fun loadFavorites() {
        viewModelScope.launch {
            runBusy {
                val response = repository.listIssues(
                    serverUrl = state.value.serverUrl,
                    search = null,
                    favoritedOnly = true,
                    sort = state.value.sortMode.apiValue,
                    page = 1,
                    pageSize = 100,
                )
                update { copy(favoriteIssues = response.items) }
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
                val priority = current.priorityFilter.takeIf { it != "All" }
                val project = current.projectFilter.takeIf { it != "All" }
                val response = repository.listIssues(
                    serverUrl = current.serverUrl,
                    search = current.search,
                    status = status,
                    priority = priority,
                    project = project,
                    searchMode = current.searchMode.apiValue,
                    openOnly = current.openOnly,
                    sort = current.sortMode.apiValue,
                    page = current.page + 1,
                    pageSize = if (current.compactList) 50 else 25,
                )
                update { copy(issues = issues + response.items, page = page + 1, totalIssues = response.total, isLoadingMore = false) }
            } catch (e: Exception) {
                update { copy(isLoadingMore = false, errorMessage = e.message ?: "Failed to load more") }
            }
        }
    }

    fun saveCurrentView() {
        val name = state.value.savedViewName.trim().ifBlank { "View ${state.value.savedViews.size + 1}" }
        val view = SavedIssueView(
            id = UUID.randomUUID().toString(),
            name = name,
            search = state.value.search,
            statusFilter = state.value.statusFilter,
            priorityFilter = state.value.priorityFilter,
            projectFilter = state.value.projectFilter,
            searchMode = state.value.searchMode.apiValue,
            openOnly = state.value.openOnly,
            sort = state.value.sortMode.apiValue,
            compactList = state.value.compactList,
        )
        val next = state.value.savedViews + view
        repository.saveIssueViews(next)
        update { copy(savedViews = next, savedViewName = "", activeSavedViewId = view.id, actionMessage = "Saved view \"$name\"") }
    }

    fun applySavedView(view: SavedIssueView) {
        val mode = SearchMode.entries.firstOrNull { it.apiValue == view.searchMode } ?: SearchMode.LOCAL
        val sort = SortMode.entries.firstOrNull { it.apiValue == view.sort } ?: SortMode.UPDATED_DESC
        update {
            copy(
                search = view.search,
                statusFilter = view.statusFilter,
                priorityFilter = view.priorityFilter,
                projectFilter = view.projectFilter,
                searchMode = mode,
                openOnly = view.openOnly,
                sortMode = sort,
                compactList = view.compactList,
                activeSavedViewId = view.id,
            )
        }
        loadIssues()
    }

    fun deleteSavedView(viewId: String) {
        val next = state.value.savedViews.filterNot { it.id == viewId }
        repository.saveIssueViews(next)
        update {
            copy(
                savedViews = next,
                activeSavedViewId = activeSavedViewId.takeIf { it != viewId },
                actionMessage = "Saved view removed",
            )
        }
    }

    fun selectIssue(issue: Issue) {
        viewModelScope.launch {
            runBusy {
                loadIssueDetail(issue.redmineIssueId?.toString() ?: issue.id)
            }
        }
    }

    fun selectIssueById(redmineIssueId: Int) {
        viewModelScope.launch {
            runBusy {
                loadIssueDetail(redmineIssueId.toString())
            }
        }
    }

    fun backToList() {
        update { copy(selectedIssue = null, commentDraft = "", internalNotes = emptyList(), journals = emptyList(), aiSummary = null, aiCategorization = null) }
    }

    fun createIssue() {
        val projectId = state.value.createProjectId.toIntOrNull()
        val priorityId = state.value.createPriorityId.toIntOrNull()
        val trackerId = state.value.createTrackerId.toIntOrNull()
        if (state.value.createSubject.isBlank() || projectId == null) {
            update { copy(errorMessage = "Subject and project are required.") }
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
                    trackerId = trackerId,
                    assignedToId = null,
                    dueDate = state.value.createDueDate,
                )
                val status = state.value.statusFilter.takeIf { it != "All" }
                val priority = state.value.priorityFilter.takeIf { it != "All" }
                val project = state.value.projectFilter.takeIf { it != "All" }
                val listResponse = repository.listIssues(
                    serverUrl = state.value.serverUrl,
                    search = state.value.search,
                    status = status,
                    priority = priority,
                    project = project,
                    searchMode = state.value.searchMode.apiValue,
                    openOnly = state.value.openOnly,
                    sort = state.value.sortMode.apiValue,
                    page = 1,
                    pageSize = if (state.value.compactList) 50 else 25,
                )
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
                        createTrackerId = "",
                        createDueDate = "",
                        actionMessage = "Created ${issue.displayId()}",
                    )
                }
            }
        }
    }

    fun showLocalIssueDialog() {
        update {
            copy(
                showLocalIssueDialog = true,
                editingLocalIssueId = null,
                localSubject = "",
                localDescription = "",
                localTracker = "Task",
                localPriority = "Normal",
                localStatusName = "New",
                localDueDate = "",
                localEstimate = "",
                localDoneRatio = "0",
            )
        }
    }

    fun openEditLocalIssueDialog(issue: Issue? = state.value.selectedIssue) {
        issue ?: return
        if (issue.source != "local") return
        update {
            copy(
                showLocalIssueDialog = true,
                editingLocalIssueId = issue.id,
                localSubject = issue.subject,
                localDescription = issue.description.orEmpty(),
                localTracker = issue.tracker ?: "Task",
                localPriority = issue.priority ?: "Normal",
                localStatusName = issue.statusName.ifBlank { "New" },
                localDueDate = issue.dueDate.orEmpty(),
                localEstimate = issue.estimatedHours?.toString().orEmpty(),
                localDoneRatio = issue.doneRatio?.toString() ?: "0",
            )
        }
    }

    fun saveLocalIssue() {
        val subject = state.value.localSubject.trim()
        if (subject.isBlank()) {
            update { copy(errorMessage = "Subject is required.") }
            return
        }
        val estimate = state.value.localEstimate.toDoubleOrNull()
        val doneRatio = state.value.localDoneRatio.toIntOrNull()?.coerceIn(0, 100)
        viewModelScope.launch {
            runBusy {
                val editingId = state.value.editingLocalIssueId
                val issue = if (editingId == null) {
                    repository.createLocalIssue(
                        serverUrl = state.value.serverUrl,
                        subject = subject,
                        description = state.value.localDescription,
                        tracker = state.value.localTracker,
                        priority = state.value.localPriority,
                        statusName = state.value.localStatusName,
                        dueDate = state.value.localDueDate,
                        estimatedHours = estimate,
                        doneRatio = doneRatio,
                    )
                } else {
                    repository.updateLocalIssue(
                        serverUrl = state.value.serverUrl,
                        issueId = editingId,
                        subject = subject,
                        description = state.value.localDescription,
                        tracker = state.value.localTracker,
                        priority = state.value.localPriority,
                        statusName = state.value.localStatusName,
                        dueDate = state.value.localDueDate,
                        estimatedHours = estimate,
                        doneRatio = doneRatio,
                    )
                }
                val local = repository.listLocalIssues(state.value.serverUrl)
                update {
                    copy(
                        localIssues = local.items,
                        selectedIssue = if (selectedIssue?.id == issue.id || editingId == null) issue else selectedIssue,
                        showLocalIssueDialog = false,
                        editingLocalIssueId = null,
                        actionMessage = if (editingId == null) "Personal ticket created" else "Personal ticket updated",
                    )
                }
            }
        }
    }

    fun deleteSelectedLocalIssue() {
        val issue = state.value.selectedIssue ?: return
        if (issue.source != "local") return
        viewModelScope.launch {
            runBusy {
                repository.deleteLocalIssue(state.value.serverUrl, issue.id)
                val local = repository.listLocalIssues(state.value.serverUrl)
                update {
                    copy(
                        selectedIssue = null,
                        localIssues = local.items,
                        currentTab = MainTab.PERSONAL,
                        actionMessage = "Personal ticket deleted",
                    )
                }
            }
        }
    }

    fun openEditIssueDialog() {
        val issue = state.value.selectedIssue ?: return
        if (issue.source == "local") {
            openEditLocalIssueDialog(issue)
            return
        }
        val matchedTrackerId = state.value.catalogTrackers
            .firstOrNull { it.name == issue.tracker }?.id?.toString().orEmpty()
        update {
            copy(
                showEditIssueDialog = true,
                editSubject = issue.subject,
                editDescription = issue.description.orEmpty(),
                editPriorityId = issue.priorityId?.toString().orEmpty(),
                editTrackerId = matchedTrackerId,
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
                    priorityId = state.value.editPriorityId.toIntOrNull(),
                    trackerId = state.value.editTrackerId.toIntOrNull(),
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
                if (state.value.currentTab == MainTab.FAVORITES) loadFavorites()
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
                        editingTimeEntryId = null,
                        timeHours = "",
                        timeComment = "",
                        timeActivityId = activities.firstOrNull()?.id?.toString().orEmpty(),
                        timeSpentOn = LocalDate.now().toString(),
                    )
                }
            }
        }
    }

    fun openEditTimeEntry(entry: TimeEntry) {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId
        val remoteEntryId = entry.redmineTimeEntryId
        if (redmineIssueId == null || remoteEntryId == null) return
        viewModelScope.launch {
            runBusy {
                val activities = repository.listActivities(state.value.serverUrl)
                update {
                    copy(
                        activities = activities,
                        showTimeDialog = true,
                        editingTimeEntryId = remoteEntryId,
                        timeHours = entry.hours.toString(),
                        timeActivityId = entry.activityId?.toString() ?: activities.firstOrNull()?.id?.toString().orEmpty(),
                        timeComment = entry.comments.orEmpty(),
                        timeSpentOn = entry.spentOn.ifBlank { LocalDate.now().toString() },
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
                val editingId = state.value.editingTimeEntryId
                if (editingId == null) {
                    repository.createTimeEntry(
                        serverUrl = state.value.serverUrl,
                        redmineIssueId = redmineIssueId,
                        hours = hours,
                        activityId = activityId,
                        comment = state.value.timeComment,
                        spentOn = state.value.timeSpentOn,
                    )
                    refreshSelectedIssue(actionMessage = "Time logged")
                } else {
                    repository.updateTimeEntry(
                        serverUrl = state.value.serverUrl,
                        redmineTimeEntryId = editingId,
                        hours = hours,
                        activityId = activityId,
                        comment = state.value.timeComment,
                        spentOn = state.value.timeSpentOn,
                    )
                    refreshSelectedIssue(actionMessage = "Time entry updated")
                }
                update { copy(showTimeDialog = false, editingTimeEntryId = null, timeHours = "", timeComment = "") }
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
        val issue = state.value.selectedIssue ?: return
        val issueId = issue.redmineIssueId?.toString() ?: issue.id
        if (state.value.internalNoteDraft.isBlank()) {
            update { copy(errorMessage = "Internal note cannot be empty.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                repository.createInternalNote(state.value.serverUrl, issueId, state.value.internalNoteDraft)
                val notes = repository.listInternalNotes(state.value.serverUrl, issueId)
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
        val issue = state.value.selectedIssue ?: return
        val issueId = issue.redmineIssueId?.toString() ?: issue.id
        viewModelScope.launch {
            runBusy {
                repository.deleteInternalNote(state.value.serverUrl, issueId, noteId)
                val notes = repository.listInternalNotes(state.value.serverUrl, issueId)
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

    fun openRelationDialog() = update { copy(showRelationDialog = true, relationType = "relates", relationTargetId = "") }

    fun createRelation() {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        val targetId = state.value.relationTargetId.toIntOrNull()
        if (targetId == null) {
            update { copy(errorMessage = "Related issue ID is required.") }
            return
        }
        viewModelScope.launch {
            runBusy {
                repository.createRelation(state.value.serverUrl, redmineIssueId, targetId, state.value.relationType)
                refreshSelectedIssue(actionMessage = "Relation added")
                update { copy(showRelationDialog = false, relationTargetId = "", relationType = "relates") }
            }
        }
    }

    fun deleteRelation(relation: IssueRelation) {
        val redmineIssueId = state.value.selectedIssue?.redmineIssueId ?: return
        if (relation.redmineRelationId <= 0) return
        viewModelScope.launch {
            runBusy {
                repository.deleteRelation(state.value.serverUrl, redmineIssueId, relation.redmineRelationId)
                refreshSelectedIssue(actionMessage = "Relation removed")
            }
        }
    }

    fun downloadAttachment(attachment: IssueAttachment) {
        val issueId = state.value.selectedIssue?.redmineIssueId ?: return
        val token = repository.currentToken()
        if (token.isNullOrBlank()) {
            update { copy(errorMessage = "Session token is missing. Pair this device again.") }
            return
        }
        val url = repository.attachmentUrl(state.value.serverUrl, issueId, attachment.redmineAttachmentId)
        val request = DownloadManager.Request(Uri.parse(url))
            .addRequestHeader("Authorization", "Bearer $token")
            .setTitle(attachment.filename.ifBlank { "Attachment ${attachment.redmineAttachmentId}" })
            .setDescription("Downloading Converge attachment")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(getApplication(), Environment.DIRECTORY_DOWNLOADS, attachment.filename.ifBlank { "attachment-${attachment.redmineAttachmentId}" })
        val manager = getApplication<Application>().getSystemService(DownloadManager::class.java)
        manager.enqueue(request)
        update { copy(actionMessage = "Attachment download started") }
    }

    fun currentBearerToken(): String? = repository.currentToken()

    fun attachmentUrl(issue: Issue, attachment: IssueAttachment): String? {
        val redmineIssueId = issue.redmineIssueId ?: return null
        return repository.attachmentUrl(state.value.serverUrl, redmineIssueId, attachment.redmineAttachmentId)
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
        viewModelScope.launch {
            runBusy {
                if (issue.source == "local") {
                    repository.createInternalNote(state.value.serverUrl, issue.id, comment)
                    refreshSelectedIssue(actionMessage = "Personal ticket comment added")
                } else {
                    val redmineIssueId = issue.redmineIssueId ?: return@runBusy
                    repository.postComment(state.value.serverUrl, redmineIssueId.toString(), comment)
                    refreshSelectedIssue(actionMessage = "Comment posted")
                }
                update { copy(commentDraft = "") }
            }
        }
    }

    fun updateStatus(statusId: Int) {
        val issue = state.value.selectedIssue ?: return
        val redmineIssueId = issue.redmineIssueId
        if (redmineIssueId == null) {
            viewModelScope.launch {
                runBusy {
                    val status = issue.allowedStatuses.firstOrNull { it.id == statusId }?.name ?: when (statusId) {
                        2 -> "In Progress"
                        3 -> "Resolved"
                        5 -> "Closed"
                        else -> "New"
                    }
                    repository.updateLocalIssue(
                        serverUrl = state.value.serverUrl,
                        issueId = issue.id,
                        subject = issue.subject,
                        description = issue.description,
                        tracker = issue.tracker,
                        priority = issue.priority,
                        statusName = status,
                        dueDate = issue.dueDate,
                        estimatedHours = issue.estimatedHours,
                        doneRatio = issue.doneRatio,
                    )
                    refreshSelectedIssue(actionMessage = "Personal ticket status updated")
                }
            }
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
                        localIssues = emptyList(),
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
        val priority = state.value.priorityFilter.takeIf { it != "All" }
        val project = state.value.projectFilter.takeIf { it != "All" }
        val response = repository.listIssues(
            serverUrl = state.value.serverUrl,
            search = state.value.search,
            status = status,
            priority = priority,
            project = project,
            searchMode = state.value.searchMode.apiValue,
            openOnly = state.value.openOnly,
            sort = state.value.sortMode.apiValue,
            page = 1,
            pageSize = if (state.value.compactList) 50 else 25,
        )
        val refreshedIssueId = refreshed.redmineIssueId?.toString() ?: refreshed.id
        val notes = runCatching { repository.listInternalNotes(state.value.serverUrl, refreshedIssueId) }.getOrElse { state.value.internalNotes }
        val journals = refreshed.redmineIssueId?.let {
            runCatching { repository.listJournals(state.value.serverUrl, it) }.getOrElse { state.value.journals }
        } ?: state.value.journals
        val local = if (refreshed.source == "local" || state.value.currentTab == MainTab.PERSONAL) {
            runCatching { repository.listLocalIssues(state.value.serverUrl).items }.getOrElse { state.value.localIssues }
        } else {
            state.value.localIssues
        }
        update { copy(selectedIssue = refreshed, issues = response.items, localIssues = local, page = 1, totalIssues = response.total, internalNotes = notes, journals = journals, actionMessage = actionMessage) }
    }

    private suspend fun loadIssueDetail(id: String) {
        val detail = repository.getIssue(state.value.serverUrl, id)
        val enriched = repository.refreshIssueLists(state.value.serverUrl, detail)
        val detailIssueId = detail.redmineIssueId?.toString() ?: detail.id
        val notes = runCatching { repository.listInternalNotes(state.value.serverUrl, detailIssueId) }.getOrElse { emptyList() }
        val journals = detail.redmineIssueId?.let {
            runCatching { repository.listJournals(state.value.serverUrl, it) }.getOrElse { emptyList() }
        } ?: emptyList()
        update { copy(selectedIssue = enriched, internalNotes = notes, journals = journals, commentDraft = "", aiSummary = null, aiCategorization = null) }
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
                localIssues = if (sessionExpired) emptyList() else localIssues,
                selectedIssue = if (sessionExpired) null else selectedIssue,
                actionMessage = null,
            )
        }
    }

    private fun update(block: MainUiState.() -> MainUiState) {
        state.value = state.value.block()
    }
}
