package com.converge.mobile.data

data class SavedIssueView(
    val id: String = "",
    val name: String = "",
    val search: String = "",
    val statusFilter: String = "All",
    val priorityFilter: String = "All",
    val projectFilter: String = "All",
    val searchMode: String = "local",
    val openOnly: Boolean = false,
    val sort: String = "updated_desc",
    val compactList: Boolean = false,
)
