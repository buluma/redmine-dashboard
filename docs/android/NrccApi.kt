package com.nrcc.mobile.network

import com.nrcc.mobile.data.CreateGithubLinkRequest
import com.nrcc.mobile.data.CreateGithubLinkResponse
import com.nrcc.mobile.data.GithubLinksResponse
import com.nrcc.mobile.data.IssueDetailResponse
import com.nrcc.mobile.data.IssuesResponse
import com.nrcc.mobile.data.MeResponse
import com.nrcc.mobile.data.OkResponse
import com.nrcc.mobile.data.PairConnectRequest
import com.nrcc.mobile.data.PairConnectResponse
import com.nrcc.mobile.data.PostCommentRequest
import com.nrcc.mobile.data.PostCommentResponse
import com.nrcc.mobile.data.RotateTokenResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface NrccApi {
    @POST("/api/mobile/v1/pair/connect")
    suspend fun pairConnect(@Body body: PairConnectRequest): PairConnectResponse

    @GET("/api/mobile/v1/me")
    suspend fun me(): MeResponse

    @GET("/api/mobile/v1/issues")
    suspend fun issues(
        @Query("status") status: String? = null,
        @Query("priority") priority: String? = null,
        @Query("search") search: String? = null,
        @Query("sort") sort: String? = "updated_desc",
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 25
    ): IssuesResponse

    @GET("/api/mobile/v1/issues/{id}")
    suspend fun issueDetail(@Path("id") redmineIssueId: Int): IssueDetailResponse

    @POST("/api/mobile/v1/issues/{id}/comment")
    suspend fun postComment(
        @Path("id") redmineIssueId: Int,
        @Body body: PostCommentRequest
    ): PostCommentResponse

    @GET("/api/mobile/v1/issues/{id}/github-links")
    suspend fun githubLinks(@Path("id") redmineIssueId: Int): GithubLinksResponse

    @POST("/api/mobile/v1/issues/{id}/github-links")
    suspend fun createGithubLink(
        @Path("id") redmineIssueId: Int,
        @Body body: CreateGithubLinkRequest
    ): CreateGithubLinkResponse

    @DELETE("/api/mobile/v1/issues/{id}/github-links/{linkId}")
    suspend fun deleteGithubLink(
        @Path("id") redmineIssueId: Int,
        @Path("linkId") linkId: String
    ): OkResponse

    @POST("/api/mobile/v1/tokens/rotate")
    suspend fun rotateToken(): RotateTokenResponse

    @DELETE("/api/mobile/v1/tokens/current")
    suspend fun revokeCurrentToken(): OkResponse
}
