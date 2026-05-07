package com.converge.mobile.data

import com.squareup.moshi.Json
import java.time.LocalDate
import java.time.format.DateTimeFormatter

data class MobileUser(
    val id: String = "",
    val username: String = "",
    val displayName: String = "",
)

data class PairConnectRequest(
    @param:Json(name = "baseUrl") val redmineBaseUrl: String,
    @param:Json(name = "apiKey") val redmineApiKey: String,
    val deviceName: String? = null,
)

data class PairConnectResponse(
    val token: String = "",
    val expiresAt: String? = null,
    val user: MobileUser = MobileUser(),
    val syncJobId: String? = null,
)

data class IssueListResponse(
    val items: List<Issue> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 25,
    val source: String? = null,
)

data class IssueDetailResponse(
    val issue: Issue = Issue(),
)

data class CreateIssueRequest(
    val subject: String,
    val description: String? = null,
    val projectId: Int,
    val priorityId: Int? = null,
    val trackerId: Int? = null,
    val assignedToId: Int? = null,
    val dueDate: String? = null,
)

data class LocalIssueRequest(
    val subject: String,
    val description: String? = null,
    val tracker: String? = null,
    val priority: String? = null,
    val statusId: Int? = null,
    val statusName: String? = null,
    val dueDate: String? = null,
    val estimatedHours: Double? = null,
    val doneRatio: Int? = null,
)

data class Issue(
    val id: String = "",
    val redmineIssueId: Int? = null,
    val redmineBaseUrl: String? = null,
    val source: String = "redmine",
    val localIssueNumber: Int? = null,
    val subject: String = "",
    val description: String? = null,
    val projectName: String? = null,
    val tracker: String? = null,
    val priority: String? = null,
    val priorityId: Int? = null,
    val statusId: Int? = null,
    val statusName: String = "",
    val parentIssueId: Int? = null,
    val parentIssueLabel: String? = null,
    val assignedToName: String? = null,
    val authorName: String? = null,
    val categoryName: String? = null,
    val dueDate: String? = null,
    val startDate: String? = null,
    val estimatedHours: Double? = null,
    val spentHours: Double? = null,
    val customFieldsJson: List<CustomField> = emptyList(),
    val updatedOnRemote: String? = null,
    val lastActivityAt: String? = null,
    val doneRatio: Int? = null,
    val isFavorited: Boolean = false,
    val allowedStatuses: List<AllowedStatus> = emptyList(),
    val children: List<IssueChild> = emptyList(),
    val githubLinks: List<GithubLink> = emptyList(),
    val attachments: List<IssueAttachment> = emptyList(),
    val relations: List<IssueRelation> = emptyList(),
    val timeEntries: List<TimeEntry> = emptyList(),
)

data class AllowedStatus(
    val id: Int = 0,
    val name: String = "",
    val isClosed: Boolean? = null,
)

data class IssueChild(
    val id: Int = 0,
    val subject: String = "",
    val tracker: String? = null,
)

data class GithubLink(
    val id: String = "",
    val repositoryFullName: String = "",
    val githubIssueNumber: Int? = null,
    val githubPrNumber: Int? = null,
    val url: String = "",
    val title: String? = null,
)

data class IssueAttachment(
    val id: String = "",
    val redmineAttachmentId: Int = 0,
    val filename: String = "",
    val filesize: Int = 0,
    val contentType: String? = null,
    val author: String? = null,
    val createdOnRemote: String? = null,
)

data class IssueRelation(
    val id: String = "",
    val redmineRelationId: Int = 0,
    val targetIssueId: Int = 0,
    val relationType: String = "",
    val delay: Int? = null,
)

data class TimeEntry(
    val id: String = "",
    val redmineTimeEntryId: Int? = null,
    val hours: Double = 0.0,
    val activityId: Int? = null,
    val activityName: String? = null,
    val authorName: String? = null,
    val comments: String? = null,
    val spentOn: String = "",
)

data class CustomField(
    val id: Int = 0,
    val name: String = "",
    val value: String? = null,
)

data class CommentRequest(
    val comment: String,
)

data class StatusRequest(
    val statusId: Int,
)

data class AssignRequest(
    val userId: Int,
)

data class EditIssueRequest(
    val subject: String? = null,
    val description: String? = null,
    val priorityId: Int? = null,
    val trackerId: Int? = null,
    val dueDate: String? = null,
    val startDate: String? = null,
    val estimatedHours: Double? = null,
)

data class FavoriteResponse(
    val favorited: Boolean = false,
)

data class AssignableUsersResponse(
    val users: List<AssignableUser> = emptyList(),
    val source: String? = null,
)

data class AssignableUser(
    val id: Int = 0,
    val name: String = "",
)

data class ActivitiesResponse(
    val activities: List<Activity> = emptyList(),
)

data class Activity(
    val id: Int = 0,
    val name: String = "",
)

data class TimeEntriesResponse(
    val items: List<TimeEntry> = emptyList(),
)

data class TimeEntryRequest(
    val hours: Double,
    val activityId: Int,
    val comment: String? = null,
    val spentOn: String? = null,
)

data class InternalNotesResponse(
    val notes: List<InternalNote> = emptyList(),
)

data class InternalNoteResponse(
    val note: InternalNote = InternalNote(),
)

data class InternalNote(
    val id: String = "",
    val content: String = "",
    val createdAt: String = "",
    val authorName: String = "",
)

data class InternalNoteRequest(
    val content: String,
)

data class GithubLinksResponse(
    val items: List<GithubLink> = emptyList(),
)

data class GithubLinkRequest(
    val repositoryFullName: String,
    val githubIssueNumber: Int? = null,
    val githubPrNumber: Int? = null,
    val url: String? = null,
    val title: String? = null,
)

data class RotateTokenResponse(
    val token: String = "",
    val expiresAt: String? = null,
)

data class NotificationsResponse(
    val notifications: List<NotificationItem> = emptyList(),
    val unreadCount: Int = 0,
)

data class NotificationItem(
    val id: String = "",
    val type: String = "info",
    val title: String = "",
    val message: String = "",
    val timestamp: String = "",
    val issueId: Int? = null,
)

data class AiIssueRequest(
    val issueId: String,
)

data class AiSummaryResponse(
    val summary: String = "",
    val keyPoints: List<String> = emptyList(),
    val actionItems: List<String> = emptyList(),
    val modelUsed: String = "",
    val provider: String? = null,
    val rawResponse: Boolean = false,
    val warning: String? = null,
)

data class AiCategorizeResponse(
    val suggestedPriority: Map<String, Any?>? = null,
    val suggestedTags: List<Map<String, Any?>> = emptyList(),
    val suggestedCategory: Map<String, Any?>? = null,
    val reasoning: String = "",
    val modelUsed: String = "",
    val provider: String? = null,
    val rawResponse: Boolean = false,
)

data class JournalDetail(
    val property: String = "",
    val name: String = "",
    @param:Json(name = "old_value") val oldValue: String? = null,
    @param:Json(name = "new_value") val newValue: String? = null,
)

data class Journal(
    val id: String = "",
    val redmineJournalId: Int = 0,
    val author: String? = null,
    val notes: String? = null,
    val details: List<JournalDetail> = emptyList(),
    val createdOnRemote: String = "",
)

data class JournalsResponse(
    val journals: List<Journal> = emptyList(),
)

data class CatalogStatus(
    val id: Int = 0,
    val name: String = "",
    val isClosed: Boolean = false,
)

data class CatalogPriority(
    val id: Int = 0,
    val name: String = "",
    val isDefault: Boolean = false,
)

data class CatalogProject(
    val id: Int = 0,
    val name: String = "",
    val identifier: String = "",
)

data class CatalogTracker(
    val id: Int = 0,
    val name: String = "",
)

data class CatalogResponse(
    val statuses: List<CatalogStatus> = emptyList(),
    val priorities: List<CatalogPriority> = emptyList(),
    val trackers: List<CatalogTracker> = emptyList(),
    val projects: List<CatalogProject> = emptyList(),
)

data class RelationCreateRequest(
    val issueToId: Int,
    val relationType: String,
    val delay: Int? = null,
)

data class ApiErrorBody(
    val error: String? = null,
)

fun Issue.displayId(): String = redmineIssueId?.let { "#$it" } ?: localIssueNumber?.let { "L$it" } ?: id

private val DATE_DISPLAY_FMT = DateTimeFormatter.ofPattern("MMM d, yyyy")

fun String.formatDate(): String = try {
    LocalDate.parse(this.take(10)).format(DATE_DISPLAY_FMT)
} catch (_: Exception) {
    this.take(10)
}

enum class DueUrgency { OVERDUE, SOON, NORMAL }

fun parseDueUrgency(dueDate: String?): DueUrgency {
    if (dueDate == null) return DueUrgency.NORMAL
    return try {
        val date = LocalDate.parse(dueDate.take(10))
        val today = LocalDate.now()
        when {
            date.isBefore(today) -> DueUrgency.OVERDUE
            !date.isAfter(today.plusDays(3)) -> DueUrgency.SOON
            else -> DueUrgency.NORMAL
        }
    } catch (_: Exception) { DueUrgency.NORMAL }
}
