package com.converge.mobile.data

import com.squareup.moshi.Moshi
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

    suspend fun listIssues(
        serverUrl: String,
        search: String?,
        status: String? = null,
        sort: String = "updated_desc",
        page: Int = 1,
    ): IssueListResponse = call {
        api(serverUrl).listIssues(
            search = search?.trim()?.takeIf { it.isNotEmpty() },
            status = status?.trim()?.takeIf { it.isNotEmpty() },
            sort = sort,
            page = page,
        )
    }

    suspend fun createIssue(
        serverUrl: String,
        subject: String,
        description: String?,
        projectId: Int,
        priorityId: Int?,
        assignedToId: Int?,
        dueDate: String?,
    ): Issue = call {
        api(serverUrl).createIssue(
            CreateIssueRequest(
                subject = subject.trim(),
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                projectId = projectId,
                priorityId = priorityId,
                assignedToId = assignedToId,
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
            ),
        ).issue
    }

    suspend fun getIssue(serverUrl: String, issueId: String): Issue = call {
        api(serverUrl).getIssue(issueId).issue
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

    suspend fun toggleFavorite(serverUrl: String, redmineIssueId: Int): Boolean = call {
        api(serverUrl).toggleFavorite(redmineIssueId.toString()).favorited
    }

    suspend fun editIssue(
        serverUrl: String,
        redmineIssueId: Int,
        subject: String?,
        description: String?,
        priority: String?,
        dueDate: String?,
        startDate: String?,
        estimatedHours: Double?,
    ) = call {
        api(serverUrl).editIssue(
            redmineIssueId.toString(),
            EditIssueRequest(
                subject = subject?.trim()?.takeIf { it.isNotEmpty() },
                description = description?.trim(),
                priority = priority?.trim()?.takeIf { it.isNotEmpty() },
                dueDate = dueDate?.trim()?.takeIf { it.isNotEmpty() },
                startDate = startDate?.trim()?.takeIf { it.isNotEmpty() },
                estimatedHours = estimatedHours,
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

    suspend fun listInternalNotes(serverUrl: String, redmineIssueId: Int): List<InternalNote> = call {
        api(serverUrl).listInternalNotes(redmineIssueId.toString()).notes
    }

    suspend fun createInternalNote(serverUrl: String, redmineIssueId: Int, content: String): InternalNote = call {
        api(serverUrl).createInternalNote(redmineIssueId.toString(), InternalNoteRequest(content.trim())).note
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
}
