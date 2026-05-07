package com.converge.mobile.data.offline

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "cached_issues",
    indices = [Index("userId"), Index("redmineIssueId")],
)
data class CachedIssueEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val redmineIssueId: Int?,
    val issueJson: String,
    val cachedAt: Long = System.currentTimeMillis(),
)
