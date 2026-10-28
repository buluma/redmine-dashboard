package com.converge.mobile.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SecureTokenStore(private val context: Context) {
    private val prefs: SharedPreferences = runCatching {
        EncryptedSharedPreferences.create(
            context,
            "converge_secure_prefs",
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrElse { e ->
        Log.e("SecureTokenStore", "EncryptedSharedPreferences failed, using plain prefs", e)
        context.deleteSharedPreferences("converge_secure_prefs")
        context.getSharedPreferences("converge_prefs_fallback", Context.MODE_PRIVATE)
    }

    fun token(): String? = prefs.getString(KEY_TOKEN, null)

    fun serverUrl(defaultUrl: String): String = prefs.getString(KEY_SERVER_URL, defaultUrl) ?: defaultUrl

    fun accountId(): String? = prefs.getString(KEY_ACCOUNT_ID, null)

    fun redmineBaseUrl(): String? = prefs.getString(KEY_REDMINE_BASE_URL, null)

    fun savedViewsJson(): String? = prefs.getString(KEY_SAVED_VIEWS, null)

    fun saveSession(serverUrl: String, token: String, accountId: String, redmineBaseUrl: String) {
        prefs.edit {
            putString(KEY_SERVER_URL, serverUrl.trimEnd('/'))
            putString(KEY_TOKEN, token)
            putString(KEY_ACCOUNT_ID, accountId)
            putString(KEY_REDMINE_BASE_URL, redmineBaseUrl.trimEnd('/'))
        }
    }

    fun saveAccountScope(accountId: String, redmineBaseUrl: String?) {
        prefs.edit {
            putString(KEY_ACCOUNT_ID, accountId)
            if (redmineBaseUrl.isNullOrBlank()) {
                remove(KEY_REDMINE_BASE_URL)
            } else {
                putString(KEY_REDMINE_BASE_URL, redmineBaseUrl.trimEnd('/'))
            }
        }
    }

    fun saveToken(token: String) {
        prefs.edit {
            putString(KEY_TOKEN, token)
        }
    }

    fun saveViewsJson(value: String) {
        prefs.edit {
            putString(KEY_SAVED_VIEWS, value)
        }
    }

    fun clear() {
        prefs.edit {
            remove(KEY_TOKEN)
            remove(KEY_ACCOUNT_ID)
            remove(KEY_REDMINE_BASE_URL)
        }
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_ACCOUNT_ID = "account_id"
        private const val KEY_REDMINE_BASE_URL = "redmine_base_url"
        private const val KEY_SAVED_VIEWS = "saved_issue_views"
    }
}
