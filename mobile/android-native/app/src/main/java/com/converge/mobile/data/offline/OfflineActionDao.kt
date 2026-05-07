package com.converge.mobile.data.offline

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OfflineActionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(action: OfflineActionEntity): Long

    @Query("SELECT * FROM offline_actions WHERE userId = :userId AND status = 'pending' ORDER BY createdAt ASC")
    suspend fun getPending(userId: String): List<OfflineActionEntity>

    @Query("UPDATE offline_actions SET status = 'done' WHERE id = :id")
    suspend fun markDone(id: Long)

    @Query("UPDATE offline_actions SET retryCount = retryCount + 1 WHERE id = :id")
    suspend fun incrementRetry(id: Long)

    @Query("UPDATE offline_actions SET status = 'failed' WHERE id = :id")
    suspend fun markFailed(id: Long)

    @Query("SELECT COUNT(*) FROM offline_actions WHERE userId = :userId AND status = 'pending'")
    suspend fun pendingCount(userId: String): Int

    @Query("DELETE FROM offline_actions WHERE status = 'done'")
    suspend fun clearDone()
}
