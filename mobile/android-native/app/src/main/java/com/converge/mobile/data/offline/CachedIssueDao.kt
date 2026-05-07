package com.converge.mobile.data.offline

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CachedIssueDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(issue: CachedIssueEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(issues: List<CachedIssueEntity>)

    @Query("SELECT * FROM cached_issues WHERE userId = :userId ORDER BY cachedAt DESC")
    suspend fun getAll(userId: String): List<CachedIssueEntity>

    @Query("SELECT * FROM cached_issues WHERE userId = :userId AND redmineIssueId = :redmineIssueId LIMIT 1")
    suspend fun getByRedmineId(userId: String, redmineIssueId: Int): CachedIssueEntity?

    @Query("DELETE FROM cached_issues WHERE userId = :userId AND cachedAt < :cutoff")
    suspend fun evictOlderThan(userId: String, cutoff: Long)
}
