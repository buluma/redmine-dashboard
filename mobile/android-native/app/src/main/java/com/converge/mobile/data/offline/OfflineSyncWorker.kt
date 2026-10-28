package com.converge.mobile.data.offline

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.converge.mobile.data.CommentRequest
import com.converge.mobile.data.ConvergeRepository
import com.converge.mobile.data.SecureTokenStore
import com.converge.mobile.data.StatusRequest
import com.converge.mobile.data.TimeEntryRequest
import com.converge.mobile.data.OfflineActionScope
import com.converge.mobile.data.OfflineActionScopeMismatchException
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.json.JSONObject

class OfflineSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val db = ConvergeDatabase.get(context)
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val store = SecureTokenStore(context)
    private val repo = ConvergeRepository(store)

    override suspend fun doWork(): Result {
        val serverUrl = store.serverUrl("").trimEnd('/').takeIf { it.isNotBlank() } ?: return Result.success()
        val accountId = store.accountId()?.takeIf { it.isNotBlank() } ?: return Result.success()
        val redmineBaseUrl = store.redmineBaseUrl()?.trimEnd('/')?.takeIf { it.isNotBlank() } ?: return Result.success()
        val requestedAccountId = inputData.getString(KEY_USER_ID) ?: return Result.success()
        val requestedServerUrl = inputData.getString(KEY_SERVER_URL)?.let(repo::normalizeServerUrl) ?: return Result.success()
        val requestedRedmineBaseUrl = inputData.getString(KEY_REDMINE_BASE_URL)?.trimEnd('/') ?: return Result.success()
        if (accountId != requestedAccountId || serverUrl != requestedServerUrl || redmineBaseUrl != requestedRedmineBaseUrl) {
            return Result.success()
        }

        val pending = db.offlineActionDao().getPending(accountId, serverUrl, redmineBaseUrl)
        if (pending.isEmpty()) return Result.success()

        var anyFailed = false
        for (action in pending) {
            val result = runCatching {
                dispatch(serverUrl, OfflineActionScope(accountId, redmineBaseUrl), action)
            }
            if (result.exceptionOrNull() is OfflineActionScopeMismatchException) {
                continue
            }
            val ok = result.isSuccess
            if (ok) {
                db.offlineActionDao().markDone(action.id)
            } else {
                db.offlineActionDao().incrementRetry(action.id)
                if (action.retryCount >= MAX_RETRIES) {
                    db.offlineActionDao().markFailed(action.id)
                } else {
                    anyFailed = true
                }
            }
        }
        db.offlineActionDao().clearDone()
        return if (anyFailed) Result.retry() else Result.success()
    }

    private suspend fun dispatch(serverUrl: String, scope: OfflineActionScope, action: OfflineActionEntity) {
        val p = JSONObject(action.payloadJson)
        when (OfflineActionType.valueOf(action.type)) {
            OfflineActionType.COMMENT ->
                repo.postComment(serverUrl, action.redmineIssueId.toString(), p.getString("comment"), scope)
            OfflineActionType.STATUS ->
                repo.updateStatus(serverUrl, action.redmineIssueId, p.getInt("statusId"), scope)
            OfflineActionType.FAVORITE ->
                repo.toggleFavorite(serverUrl, action.redmineIssueId, scope)
            OfflineActionType.TIME_ENTRY ->
                repo.createTimeEntry(
                    serverUrl,
                    action.redmineIssueId,
                    p.getDouble("hours"),
                    p.getInt("activityId"),
                    p.optString("comment").takeIf { it.isNotBlank() },
                    p.optString("spentOn").takeIf { it.isNotBlank() },
                    scope,
                )
        }
    }

    companion object {
        const val KEY_USER_ID = "userId"
        const val KEY_SERVER_URL = "serverUrl"
        const val KEY_REDMINE_BASE_URL = "redmineBaseUrl"
        private const val MAX_RETRIES = 3
    }
}
