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

    fun saveSession(serverUrl: String, token: String) {
        prefs.edit {
            putString(KEY_SERVER_URL, serverUrl.trimEnd('/'))
            putString(KEY_TOKEN, token)
        }
    }

    fun saveToken(token: String) {
        prefs.edit {
            putString(KEY_TOKEN, token)
        }
    }

    fun clear() {
        prefs.edit {
            remove(KEY_TOKEN)
        }
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
    }
}
