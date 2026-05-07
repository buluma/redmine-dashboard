package com.converge.mobile.data.offline

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "offline_actions",
    indices = [Index("userId"), Index("status")],
)
data class OfflineActionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: String,
    val type: String,
    val redmineIssueId: Int,
    val payloadJson: String,
    val status: String = "pending",
    val retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
)
