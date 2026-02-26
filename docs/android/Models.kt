package com.nrcc.mobile.data

data class ApiError(
    val error: String
)

data class MobileUser(
    val id: String,
    val username: String,
    val displayName: String
)

data class PairConnectRequest(
    val baseUrl: String,
    val apiKey: String,
    val deviceName: String? = null
)

data class PairConnectResponse(
    val token: String,
    val expiresAt: String?,
    val user: MobileUser,
    val syncJobId: String?
)

data class MobileTokenMeta(
    val id: String,
    val name: String?,
    val tokenPrefix: String,
    val lastUsedAt: String?,
    val createdAt: String,
    val expiresAt: String?
)

data class MeResponse(
    val user: MobileUser,
    val token: MobileTokenMeta?
)

data class Journal(
    val id: String,
    val author: String?,
    val notes: String?,
    val createdOnRemote: String
)

data class TimeEntry(
    val id: String,
    val redmineTimeEntryId: Int?,
    val hours: Double,
    val activityId: Int,
    val activityName: String?,
    val authorName: String?,
    val comments: String?,
    val spentOn: String
)

data class GithubLink(
    val id: String,
    val repositoryFullName: String,
    val githubIssueNumber: Int?,
    val githubPrNumber: Int?,
    val url: String,
    val title: String?,
    val createdAt: String
)

data class Issue(
    val id: String,
    val redmineIssueId: Int,
    val subject: String,
    val description: String?,
    val projectName: String?,
    val tracker: String?,
    val priority: String?,
    val statusId: Int,
    val statusName: String,
    val assignedToName: String?,
    val updatedOnRemote: String,
    val dueDate: String?,
    val doneRatio: Int?,
    val journals: List<Journal> = emptyList(),
    val timeEntries: List<TimeEntry> = emptyList(),
    val githubLinks: List<GithubLink> = emptyList()
)

data class IssuesResponse(
    val items: List<Issue>,
    val total: Int,
    val page: Int,
    val pageSize: Int
)

data class IssueDetailResponse(
    val issue: Issue
)

data class PostCommentRequest(
    val comment: String
)

data class PostCommentResponse(
    val ok: Boolean,
    val issue: Issue
)

data class GithubLinksResponse(
    val items: List<GithubLink>
)

data class CreateGithubLinkRequest(
    val repositoryFullName: String,
    val githubIssueNumber: Int? = null,
    val githubPrNumber: Int? = null,
    val url: String? = null,
    val title: String? = null
)

data class CreateGithubLinkResponse(
    val ok: Boolean,
    val link: GithubLink
)

data class RotateTokenResponse(
    val token: String,
    val expiresAt: String?
)

data class OkResponse(
    val ok: Boolean
)
