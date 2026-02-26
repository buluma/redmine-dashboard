package com.nrcc.mobile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nrcc.mobile.auth.AuthTokenStore
import com.nrcc.mobile.data.CreateGithubLinkRequest
import com.nrcc.mobile.data.Issue
import com.nrcc.mobile.repository.AuthRepository
import com.nrcc.mobile.repository.IssueActionsRepository
import com.nrcc.mobile.repository.IssuesRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class PairViewModel(
    private val authRepository: AuthRepository,
    private val tokenStore: AuthTokenStore
) : ViewModel() {
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun pair(baseUrl: String, redmineApiKey: String, deviceName: String?, onPaired: () -> Unit) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val token = authRepository.pair(baseUrl, redmineApiKey, deviceName)
                tokenStore.setBearerToken(token)
                onPaired()
            } catch (e: Exception) {
                _error.value = e.message ?: "Pairing failed"
            } finally {
                _loading.value = false
            }
        }
    }
}

class IssuesViewModel(
    private val issuesRepository: IssuesRepository
) : ViewModel() {
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _issues = MutableStateFlow<List<Issue>>(emptyList())
    val issues: StateFlow<List<Issue>> = _issues.asStateFlow()

    fun loadIssues(search: String? = null) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                _issues.value = issuesRepository.listIssues(search = search?.takeIf { it.isNotBlank() })
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load issues"
            } finally {
                _loading.value = false
            }
        }
    }
}

class IssueDetailViewModel(
    private val issuesRepository: IssuesRepository,
    private val issueActionsRepository: IssueActionsRepository
) : ViewModel() {
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _issue = MutableStateFlow<Issue?>(null)
    val issue: StateFlow<Issue?> = _issue.asStateFlow()

    fun load(issueId: Int) {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                _issue.value = issuesRepository.getIssue(issueId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load issue"
            } finally {
                _loading.value = false
            }
        }
    }

    fun postComment(issueId: Int, comment: String) {
        viewModelScope.launch {
            _error.value = null
            try {
                issueActionsRepository.postComment(issueId, comment)
                load(issueId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to post comment"
            }
        }
    }

    fun addGithubLink(issueId: Int, request: CreateGithubLinkRequest) {
        viewModelScope.launch {
            _error.value = null
            try {
                issueActionsRepository.addGithubLink(
                    issueId = issueId,
                    repositoryFullName = request.repositoryFullName,
                    githubIssueNumber = request.githubIssueNumber,
                    githubPrNumber = request.githubPrNumber,
                    url = request.url,
                    title = request.title
                )
                load(issueId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to add GitHub link"
            }
        }
    }

    fun removeGithubLink(issueId: Int, linkId: String) {
        viewModelScope.launch {
            _error.value = null
            try {
                issueActionsRepository.removeGithubLink(issueId, linkId)
                load(issueId)
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to remove GitHub link"
            }
        }
    }
}
