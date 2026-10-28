package com.converge.mobile.data.offline

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [CachedIssueEntity::class, OfflineActionEntity::class], version = 3, exportSchema = false)
abstract class ConvergeDatabase : RoomDatabase() {
    abstract fun cachedIssueDao(): CachedIssueDao
    abstract fun offlineActionDao(): OfflineActionDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE offline_actions ADD COLUMN serverUrl TEXT NOT NULL DEFAULT ''")
                database.execSQL("ALTER TABLE offline_actions ADD COLUMN redmineBaseUrl TEXT NOT NULL DEFAULT ''")
                database.execSQL("DELETE FROM offline_actions")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "UPDATE offline_actions SET serverUrl = CASE " +
                        "WHEN trim(serverUrl) LIKE 'http://%' OR trim(serverUrl) LIKE 'https://%' " +
                        "THEN rtrim(trim(serverUrl), '/') " +
                        "ELSE 'http://' || rtrim(trim(serverUrl), '/') END " +
                        "WHERE trim(serverUrl) <> ''",
                )
            }
        }

        @Volatile private var instance: ConvergeDatabase? = null

        fun get(context: Context): ConvergeDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ConvergeDatabase::class.java,
                    "converge_offline.db",
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build().also { instance = it }
            }
    }
}
