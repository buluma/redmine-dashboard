package com.converge.mobile.data.offline

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [CachedIssueEntity::class, OfflineActionEntity::class], version = 1, exportSchema = false)
abstract class ConvergeDatabase : RoomDatabase() {
    abstract fun cachedIssueDao(): CachedIssueDao
    abstract fun offlineActionDao(): OfflineActionDao

    companion object {
        @Volatile private var instance: ConvergeDatabase? = null

        fun get(context: Context): ConvergeDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ConvergeDatabase::class.java,
                    "converge_offline.db",
                ).build().also { instance = it }
            }
    }
}
