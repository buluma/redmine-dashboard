package com.converge.mobile.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.PUT
import retrofit2.http.Query

interface ConvergeApi {
    @POST("api/mobile/v1/pair/connect")
    suspend fun pairConnect(@Body body: PairConnectRequest): PairConnectResponse

    @GET("api/mobile/v1/issues")
    suspend fun listIssues(
        @Query("search") search: String? = null,
        @Query("status") status: String? = null,
        @Query("priority") priority: String? = null,
        @Query("project") project: String? = null,
        @Query("searchMode") searchMode: String = "local",
        @Query("scope") scope: String = "issues",
        @Query("openOnly") openOnly: Boolean = false,
        @Query("favoritedOnly") favoritedOnly: Boolean = false,
        @Query("sort") sort: String = "updated_desc",
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 25,
    ): IssueListResponse

    @GET("api/mobile/v1/issues/{id}")
    suspend fun getIssue(@Path("id") issueId: String): IssueDetailResponse

    @POST("api/mobile/v1/issues")
    suspend fun createIssue(@Body body: CreateIssueRequest): IssueDetailResponse

    @POST("api/mobile/v1/issues/{id}/comment")
    suspend fun postComment(
        @Path("id") issueId: String,
        @Body body: CommentRequest,
    )

    @POST("api/mobile/v1/issues/{id}/status")
    suspend fun updateStatus(
        @Path("id") issueId: String,
        @Body body: StatusRequest,
    )

    @POST("api/mobile/v1/issues/{id}/assign")
    suspend fun assignIssue(
        @Path("id") issueId: String,
        @Body body: AssignRequest,
    )

    @GET("api/mobile/v1/issues/assignable-users")
    suspend fun listAssignableUsers(): AssignableUsersResponse

    @GET("api/mobile/v1/activities")
    suspend fun listActivities(): ActivitiesResponse

    @GET("api/mobile/v1/notifications")
    suspend fun listNotifications(): NotificationsResponse

    @POST("api/mobile/v1/issues/{id}/favorite")
    suspend fun toggleFavorite(@Path("id") issueId: String): FavoriteResponse

    @PUT("api/mobile/v1/issues/{id}/edit")
    suspend fun editIssue(
        @Path("id") issueId: String,
        @Body body: EditIssueRequest,
    )

    @GET("api/mobile/v1/issues/{id}/time-entries")
    suspend fun listTimeEntries(@Path("id") issueId: String): TimeEntriesResponse

    @POST("api/mobile/v1/issues/{id}/time-entries")
    suspend fun createTimeEntry(
        @Path("id") issueId: String,
        @Body body: TimeEntryRequest,
    )

    @PATCH("api/mobile/v1/time-entries/{id}")
    suspend fun updateTimeEntry(
        @Path("id") redmineTimeEntryId: Int,
        @Body body: TimeEntryRequest,
    )

    @DELETE("api/mobile/v1/time-entries/{id}")
    suspend fun deleteTimeEntry(@Path("id") redmineTimeEntryId: Int)

    @GET("api/mobile/v1/issues/{id}/internal-notes")
    suspend fun listInternalNotes(@Path("id") issueId: String): InternalNotesResponse

    @POST("api/mobile/v1/issues/{id}/internal-notes")
    suspend fun createInternalNote(
        @Path("id") issueId: String,
        @Body body: InternalNoteRequest,
    ): InternalNoteResponse

    @DELETE("api/mobile/v1/issues/{id}/internal-notes/{noteId}")
    suspend fun deleteInternalNote(
        @Path("id") issueId: String,
        @Path("noteId") noteId: String,
    )

    @GET("api/mobile/v1/issues/{id}/github-links")
    suspend fun listGithubLinks(@Path("id") issueId: String): GithubLinksResponse

    @POST("api/mobile/v1/issues/{id}/github-links")
    suspend fun addGithubLink(
        @Path("id") issueId: String,
        @Body body: GithubLinkRequest,
    )

    @DELETE("api/mobile/v1/issues/{id}/github-links/{linkId}")
    suspend fun removeGithubLink(
        @Path("id") issueId: String,
        @Path("linkId") linkId: String,
    )

    @POST("api/ai/summarize")
    suspend fun summarizeIssue(@Body body: AiIssueRequest): AiSummaryResponse

    @POST("api/ai/categorize")
    suspend fun categorizeIssue(@Body body: AiIssueRequest): AiCategorizeResponse

    @POST("api/mobile/v1/tokens/rotate")
    suspend fun rotateToken(): RotateTokenResponse

    @GET("api/mobile/v1/issues/{id}/journals")
    suspend fun listJournals(@Path("id") issueId: String): JournalsResponse

    @GET("api/mobile/v1/catalogs")
    suspend fun getCatalogs(): CatalogResponse

    @POST("api/mobile/v1/issues/{id}/relations")
    suspend fun createRelation(
        @Path("id") issueId: String,
        @Body body: RelationCreateRequest,
    )

    @DELETE("api/mobile/v1/issues/{id}/relations/{relationId}")
    suspend fun deleteRelation(
        @Path("id") issueId: String,
        @Path("relationId") relationId: Int,
    )

    @DELETE("api/mobile/v1/tokens/current")
    suspend fun revokeCurrentToken()
}
