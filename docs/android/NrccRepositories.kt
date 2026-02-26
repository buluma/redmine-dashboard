package com.nrcc.mobile.repository

import com.nrcc.mobile.data.CreateGithubLinkRequest
import com.nrcc.mobile.data.Issue
import com.nrcc.mobile.data.PairConnectRequest
import com.nrcc.mobile.data.PostCommentRequest
import com.nrcc.mobile.network.NrccApi

class AuthRepository(
    private val api: NrccApi
) {
    suspend fun pair(baseUrl: String, redmineApiKey: String, deviceName: String?): String {
        val response = api.pairConnect(
            PairConnectRequest(
                baseUrl = baseUrl,
                apiKey = redmineApiKey,
                deviceName = deviceName
            )
        )
        return response.token
    }

    suspend fun rotateToken(): String = api.rotateToken().token

    suspend fun revokeCurrentToken() {
        api.revokeCurrentToken()
    }
}

class IssuesRepository(
    private val api: NrccApi
) {
    suspend fun listIssues(
        status: String? = null,
        priority: String? = null,
        search: String? = null,
        sort: String = "updated_desc",
        page: Int = 1,
        pageSize: Int = 25
    ): List<Issue> {
        return api.issues(
            status = status,
            priority = priority,
            search = search,
            sort = sort,
            page = page,
            pageSize = pageSize
        ).items
    }

    suspend fun getIssue(issueId: Int): Issue {
        return api.issueDetail(issueId).issue
    }
}

class IssueActionsRepository(
    private val api: NrccApi
) {
    suspend fun postComment(issueId: Int, comment: String) {
        api.postComment(issueId, PostCommentRequest(comment))
    }

    suspend fun addGithubLink(
        issueId: Int,
        repositoryFullName: String,
        githubIssueNumber: Int? = null,
        githubPrNumber: Int? = null,
        url: String? = null,
        title: String? = null
    ) {
        api.createGithubLink(
            issueId,
            CreateGithubLinkRequest(
                repositoryFullName = repositoryFullName,
                githubIssueNumber = githubIssueNumber,
                githubPrNumber = githubPrNumber,
                url = url,
                title = title
            )
        )
    }

    suspend fun removeGithubLink(issueId: Int, linkId: String) {
        api.deleteGithubLink(issueId, linkId)
    }
}
