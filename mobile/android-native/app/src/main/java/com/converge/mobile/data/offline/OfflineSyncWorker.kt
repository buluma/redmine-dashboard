package com.converge.mobile.data.offline

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.converge.mobile.data.CommentRequest
import com.converge.mobile.data.ConvergeRepository
import com.converge.mobile.data.SecureTokenStore
import com.converge.mobile.data.StatusRequest
import com.converge.mobile.data.TimeEntryRequest
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
        val serverUrl = store.serverUrl("").takeIf { it.isNotBlank() } ?: return Result.success()
        val userId = inputData.getString(KEY_USER_ID) ?: return Result.success()

        val pending = db.offlineActionDao().getPending(userId)
        if (pending.isEmpty()) return Result.success()

        var anyFailed = false
        for (action in pending) {
            val ok = runCatching { dispatch(serverUrl, action) }.isSuccess
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

    private suspend fun dispatch(serverUrl: String, action: OfflineActionEntity) {
        val p = JSONObject(action.payloadJson)
        when (OfflineActionType.valueOf(action.type)) {
            OfflineActionType.COMMENT ->
                repo.postComment(serverUrl, action.redmineIssueId.toString(), p.getString("comment"))
            OfflineActionType.STATUS ->
                repo.updateStatus(serverUrl, action.redmineIssueId, p.getInt("statusId"))
            OfflineActionType.FAVORITE ->
                repo.toggleFavorite(serverUrl, action.redmineIssueId)
            OfflineActionType.TIME_ENTRY ->
                repo.createTimeEntry(
                    serverUrl,
                    action.redmineIssueId,
                    p.getDouble("hours"),
                    p.getInt("activityId"),
                    p.optString("comment").takeIf { it.isNotBlank() },
                    p.optString("spentOn").takeIf { it.isNotBlank() },
                )
        }
    }

    companion object {
        const val KEY_USER_ID = "userId"
        private const val MAX_RETRIES = 3
    }
}
