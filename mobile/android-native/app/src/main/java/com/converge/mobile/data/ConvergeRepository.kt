package com.converge.mobile.data

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

class ConvergeRepository(
    private val tokenStore: SecureTokenStore,
) {
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val errorAdapter = moshi.adapter(ApiErrorBody::class.java)
    private val clients = ConcurrentHashMap<String, ConvergeApi>()

    fun hasToken(): Boolean = !tokenStore.token().isNullOrBlank()

    fun savedServerUrl(defaultUrl: String): String = tokenStore.serverUrl(defaultUrl)

    fun savedIssueViews(): List<SavedIssueView> {
        val json = tokenStore.savedViewsJson()?.takeIf { it.isNotBlank() } ?: return emptyList()
        val type = Types.newParameterizedType(List::class.java, SavedIssueView::class.java)
        return runCatching {
            moshi.adapter<List<SavedIssueView>>(type).fromJson(json).orEmpty()
        }.getOrElse { emptyList() }
    }

    fun saveIssueViews(views: List<SavedIssueView>) {
        val type = Types.newParameterizedType(List::class.java, SavedIssueView::class.java)
        val json = moshi.adapter<List<SavedIssueView>>(type).toJson(views)
        tokenStore.saveViewsJson(json)
    }

    suspend fun pair(serverUrl: String, redmineBaseUrl: String, redmineApiKey: String, deviceName: String?) {
        val cleanServerUrl = normalizeBaseUrl(serverUrl)
        val response = call {
            api(cleanServerUrl).pairConnect(
                PairConnectRequest(
                    redmineBaseUrl = redmineBaseUrl.trim(),
                    redmineApiKey = redmineApiKey.trim(),
                    deviceName = deviceName?.trim()?.takeIf { it.isNotEmpty() },
                ),
            )
        }
        if (response.token.isBlank()) {
            throw ApiException("Pairing succeeded without a token.")
        }
        tokenStore.saveSession(cleanServerUrl, response.token)
        clients.remove(cleanServerUrl)
    }

    fun currentToken(): String? = tokenStore.token()

    suspend fun listIssues(
        serverUrl: String,
        search: String?,
        status: String? = null,
        priority: String? = null,
        project: String? = null,
        source: String = "all",
        searchMode: String = "local",
        openOnly: Boolean = false,
        favoritedOnly: Boolean = false,
        sort: String = "updated_desc",
        page: Int = 1,
        pageSize: Int = 25,
    ): IssueListResponse = call {
        api(serverUrl).listIssues(
            search = search?.trim()?.takeIf { it.isNotEmpty() },
            status = status?.trim()?.takeIf { it.isNotEmpty() },
            priority = priority?.trim()?.takeIf { it.isNotEmpty() },
            project = project?.trim()?.takeIf { it.isNotEmpty() },
            source = source,
            searchMode = searchMode,
            openOnly = openOnly,
            favoritedOnly = favoritedOnly,
            sort = sort,
            page = page,
            pageSize = pageSize,
        )
    }

    suspend fun createIssue(
        serverUrl: String,
        subject: String,
        description: String?,
        projectId: Int,
        priorityId: Int?,
        trackerId: Int?,
        assignedToId: Int?,
        dueDate: String?,
    ): Issue = call {
        api(serverUrl).createIssue(
            CreateIssueRequest(
                subject = subject.trim(),
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                projectId = projectId,
                priorityId = priorityId,
                trackerId = trackerId,
                assignedToId = assignedToId,
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).issue
    }

    suspend fun getIssue(serverUrl: String, issueId: String): Issue = call {
        api(serverUrl).getIssue(issueId).issue
    }

    suspend fun listLocalIssues(serverUrl: String): IssueListResponse = call {
        api(serverUrl).listLocalIssues()
    }

    suspend fun createLocalIssue(
        serverUrl: String,
        subject: String,
        description: String?,
        tracker: String?,
        priority: String?,
        statusName: String?,
        dueDate: String?,
        estimatedHours: Double?,
        doneRatio: Int?,
    ): Issue = call {
        api(serverUrl).createLocalIssue(
            LocalIssueRequest(
                subject = subject.trim(),
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                tracker = tracker?.trim()?.takeIf { it.isNotEmpty() },
                priority = priority?.trim()?.takeIf { it.isNotEmpty() },
                statusId = statusIdFor(statusName),
                statusName = statusName?.trim()?.takeIf { it.isNotEmpty() } ?: "New",
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
                estimatedHours = estimatedHours,
                doneRatio = doneRatio,
            ),
        ).issue
    }

    suspend fun updateLocalIssue(
        serverUrl: String,
        issueId: String,
        subject: String?,
        description: String?,
        tracker: String?,
        priority: String?,
        statusName: String?,
        dueDate: String?,
        estimatedHours: Double?,
        doneRatio: Int?,
    ): Issue = call {
        api(serverUrl).updateLocalIssue(
            issueId,
            LocalIssueRequest(
                subject = subject?.trim().orEmpty(),
                description = description?.trim(),
                tracker = tracker?.trim()?.takeIf { it.isNotEmpty() },
                priority = priority?.trim()?.takeIf { it.isNotEmpty() },
                statusId = statusIdFor(statusName),
                statusName = statusName?.trim()?.takeIf { it.isNotEmpty() },
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
                estimatedHours = estimatedHours,
                doneRatio = doneRatio,
            ),
        ).issue
    }

    suspend fun deleteLocalIssue(serverUrl: String, issueId: String) = call {
        api(serverUrl).deleteLocalIssue(issueId)
    }

    suspend fun postComment(serverUrl: String, issueId: String, comment: String) = call {
        api(serverUrl).postComment(issueId, CommentRequest(comment.trim()))
    }

    suspend fun updateStatus(serverUrl: String, redmineIssueId: Int, statusId: Int) = call {
        api(serverUrl).updateStatus(redmineIssueId.toString(), StatusRequest(statusId))
    }

    suspend fun assignIssue(serverUrl: String, redmineIssueId: Int, userId: Int) = call {
        api(serverUrl).assignIssue(redmineIssueId.toString(), AssignRequest(userId))
    }

    suspend fun listAssignableUsers(serverUrl: String): List<AssignableUser> = call {
        api(serverUrl).listAssignableUsers().users
    }

    suspend fun listActivities(serverUrl: String): List<Activity> = call {
        api(serverUrl).listActivities().activities
    }

    suspend fun listNotifications(serverUrl: String): NotificationsResponse = call {
        api(serverUrl).listNotifications()
    }

    suspend fun toggleFavorite(serverUrl: String, redmineIssueId: Int): Boolean = call {
        api(serverUrl).toggleFavorite(redmineIssueId.toString()).favorited
    }

    suspend fun editIssue(
        serverUrl: String,
        redmineIssueId: Int,
        subject: String?,
        description: String?,
        priorityId: Int?,
        trackerId: Int?,
        dueDate: String?,
        startDate: String?,
        estimatedHours: Double?,
        customFields: List<CustomFieldEdit>? = null,
    ) = call {
        api(serverUrl).editIssue(
            redmineIssueId.toString(),
            EditIssueRequest(
                subject = subject?.trim()?.takeIf { it.isNotEmpty() },
                description = description?.trim(),
                priorityId = priorityId,
                trackerId = trackerId,
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
                startDate = startDate?.trim()?.takeIf { it.isNotEmpty() },
                estimatedHours = estimatedHours,
                customFields = customFields?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    suspend fun listTimeEntries(serverUrl: String, redmineIssueId: Int): List<TimeEntry> = call {
        api(serverUrl).listTimeEntries(redmineIssueId.toString()).items
    }

    suspend fun createTimeEntry(
        serverUrl: String,
        redmineIssueId: Int,
        hours: Double,
        activityId: Int,
        comment: String?,
        spentOn: String?,
    ) = call {
        api(serverUrl).createTimeEntry(
            redmineIssueId.toString(),
            TimeEntryRequest(
                hours = hours,
                activityId = activityId,
                comment = comment?.trim()?.takeIf { it.isNotEmpty() },
                spentOn = spentOn?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    suspend fun deleteTimeEntry(serverUrl: String, redmineTimeEntryId: Int) = call {
        api(serverUrl).deleteTimeEntry(redmineTimeEntryId)
    }

    suspend fun updateTimeEntry(
        serverUrl: String,
        redmineTimeEntryId: Int,
        hours: Double,
        activityId: Int,
        comment: String?,
        spentOn: String?,
    ) = call {
        api(serverUrl).updateTimeEntry(
            redmineTimeEntryId,
            TimeEntryRequest(
                hours = hours,
                activityId = activityId,
                comment = comment?.trim()?.takeIf { it.isNotEmpty() },
                spentOn = spentOn?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    suspend fun listInternalNotes(serverUrl: String, issueId: String): List<InternalNote> = call {
        api(serverUrl).listInternalNotes(issueId).notes
    }

    suspend fun createInternalNote(serverUrl: String, issueId: String, content: String): InternalNote = call {
        api(serverUrl).createInternalNote(issueId, InternalNoteRequest(content.trim())).note
    }

    suspend fun deleteInternalNote(serverUrl: String, issueId: String, noteId: String) = call {
        api(serverUrl).deleteInternalNote(issueId, noteId)
    }

    suspend fun listGithubLinks(serverUrl: String, redmineIssueId: Int): List<GithubLink> = call {
        api(serverUrl).listGithubLinks(redmineIssueId.toString()).items
    }

    suspend fun addGithubLink(
        serverUrl: String,
        redmineIssueId: Int,
        repositoryFullName: String,
        githubIssueNumber: Int?,
        githubPrNumber: Int?,
        url: String?,
        title: String?,
    ) = call {
        api(serverUrl).addGithubLink(
            redmineIssueId.toString(),
            GithubLinkRequest(
                repositoryFullName = repositoryFullName.trim(),
                githubIssueNumber = githubIssueNumber,
                githubPrNumber = githubPrNumber,
                url = url?.trim()?.takeIf { it.isNotEmpty() },
                title = title?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    suspend fun removeGithubLink(serverUrl: String, redmineIssueId: Int, linkId: String) = call {
        api(serverUrl).removeGithubLink(redmineIssueId.toString(), linkId)
    }

    suspend fun listJournals(serverUrl: String, redmineIssueId: Int): List<Journal> = call {
        api(serverUrl).listJournals(redmineIssueId.toString()).journals
    }

    suspend fun getCatalogs(serverUrl: String): CatalogResponse = call {
        api(serverUrl).getCatalogs()
    }

    suspend fun createRelation(serverUrl: String, redmineIssueId: Int, issueToId: Int, relationType: String) = call {
        api(serverUrl).createRelation(
            redmineIssueId.toString(),
            RelationCreateRequest(issueToId = issueToId, relationType = relationType),
        )
    }

    suspend fun deleteRelation(serverUrl: String, redmineIssueId: Int, redmineRelationId: Int) = call {
        api(serverUrl).deleteRelation(redmineIssueId.toString(), redmineRelationId)
    }

    suspend fun summarizeIssue(serverUrl: String, issueId: String): AiSummaryResponse = call {
        api(serverUrl).summarizeIssue(AiIssueRequest(issueId))
    }

    suspend fun categorizeIssue(serverUrl: String, issueId: String): AiCategorizeResponse = call {
        api(serverUrl).categorizeIssue(AiIssueRequest(issueId))
    }

    suspend fun rotateToken(serverUrl: String) = call {
        val next = api(serverUrl).rotateToken()
        if (next.token.isBlank()) throw ApiException("Token rotation returned an empty token.")
        tokenStore.saveToken(next.token)
    }

    suspend fun refreshIssueLists(serverUrl: String, issue: Issue): Issue {
        val redmineIssueId = issue.redmineIssueId ?: return issue
        val detail = getIssue(serverUrl, redmineIssueId.toString())
        val freshTimes = runCatching { listTimeEntries(serverUrl, redmineIssueId) }.getOrElse { detail.timeEntries }
        val freshLinks = runCatching { listGithubLinks(serverUrl, redmineIssueId) }.getOrElse { detail.githubLinks }
        return detail.copy(timeEntries = freshTimes, githubLinks = freshLinks)
    }

    suspend fun logout(serverUrl: String) {
        runCatching { api(serverUrl).revokeCurrentToken() }
        tokenStore.clear()
    }

    fun attachmentUrl(serverUrl: String, redmineIssueId: Int, redmineAttachmentId: Int): String =
        "${normalizeBaseUrl(serverUrl)}/api/mobile/v1/issues/$redmineIssueId/attachments/$redmineAttachmentId"

    fun clearLocalSession() {
        tokenStore.clear()
    }

    private fun api(serverUrl: String): ConvergeApi {
        val baseUrl = normalizeBaseUrl(serverUrl)
        return clients.getOrPut(baseUrl) {
            Retrofit.Builder()
                .baseUrl("$baseUrl/")
                .client(okHttpClient())
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
                .create(ConvergeApi::class.java)
        }
    }

    private fun okHttpClient(): OkHttpClient {
        val authInterceptor = Interceptor { chain ->
            val token = tokenStore.token()
            val request = if (token.isNullOrBlank()) {
                chain.request()
            } else {
                chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            }
            chain.proceed(request)
        }

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private suspend fun <T> call(block: suspend () -> T): T {
        try {
            return block()
        } catch (error: HttpException) {
            if (error.code() == 401) {
                tokenStore.clear()
                throw ApiException("Session expired. Pair this device again.")
            }
            val body = error.response()?.errorBody()?.string()
            val message = body
                ?.let { runCatching { errorAdapter.fromJson(it)?.error }.getOrNull() }
                ?.takeIf { it.isNotBlank() }
                ?: "Converge returned HTTP ${error.code()}."
            throw ApiException(message)
        } catch (error: IOException) {
            throw ApiException("Cannot reach Converge. Check the server URL and network connection.")
        }
    }

    private fun normalizeBaseUrl(raw: String): String {
        val value = raw.trim().trimEnd('/')
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return value
        }
        return "http://$value"
    }

    private fun statusIdFor(statusName: String?): Int = when (statusName?.trim()?.lowercase()) {
        "in progress" -> 2
        "resolved" -> 3
        "closed" -> 5
        else -> 1
    }
}
