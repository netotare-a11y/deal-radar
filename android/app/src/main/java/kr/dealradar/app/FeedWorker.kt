package kr.dealradar.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.net.HttpURLConnection
import java.net.URL
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

private const val CHANNEL_ID = "deal_alerts"
private const val PREFS = "alerts"
private const val KEY_SEEN = "seen"
private const val KEY_INITIALIZED = "initialized"
private const val KEY_DIGEST = "last_digest"
private const val MAX_SEEN = 2000

class FeedWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val feed = try {
            FeedParser.parse(download())
        } catch (error: Exception) {
            return Result.retry()
        }

        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = ZonedDateTime.now(ZoneId.of("Asia/Seoul"))
        val seen = prefs.getStringSet(KEY_SEEN, emptySet()).orEmpty()
        val plan = AlertPlanner.plan(
            feed = feed,
            seen = seen,
            initialized = prefs.getBoolean(KEY_INITIALIZED, false),
            lastDigestDate = prefs.getString(KEY_DIGEST, "").orEmpty(),
            today = now.toLocalDate().toString(),
            hour = now.hour,
        )

        // 알림이 꺼져 있으면 읽음 처리하지 않는다. 켜는 순간 놓친 소식을 묶어서 받는다.
        if (plan.alerts.isNotEmpty() && !canNotify()) return Result.success()

        plan.alerts.forEach(::show)

        val current = (feed.releases.map { it.id } + feed.deals.map { it.id }).toSet()
        val nextSeen = (seen + plan.markSeen).let { all ->
            // 피드에서 빠진 오래된 id 부터 지운다.
            if (all.size <= MAX_SEEN) all else (all - (all - current).take(all.size - MAX_SEEN).toSet())
        }
        prefs.edit()
            .putStringSet(KEY_SEEN, nextSeen)
            .putBoolean(KEY_INITIALIZED, true)
            .apply {
                plan.digestDate?.let { putString(KEY_DIGEST, it) }
            }
            .apply()
        return Result.success()
    }

    private fun download(): String {
        val url = URL("${BuildConfig.SITE_URL}data/feed.json?t=${System.currentTimeMillis()}")
        val connection = url.openConnection() as HttpURLConnection
        connection.connectTimeout = 20_000
        connection.readTimeout = 30_000
        connection.useCaches = false
        try {
            if (connection.responseCode != 200) error("HTTP ${connection.responseCode}")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun canNotify(): Boolean {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(applicationContext).areNotificationsEnabled()
    }

    private fun show(alert: Alert) {
        val context = applicationContext
        val intent = if (alert.url != null) {
            Intent(Intent.ACTION_VIEW, Uri.parse(alert.url))
        } else {
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pending = PendingIntent.getActivity(
            context,
            alert.key.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(alert.title)
            .setContentText(alert.body.lineSequence().first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(alert.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(alert.key.hashCode(), notification)
        } catch (denied: SecurityException) {
            // 실행 사이에 권한이 꺼진 경우. 다음 실행에서 canNotify 가 걸러낸다.
        }
    }

    companion object {
        private const val PERIODIC_NAME = "feed-check"
        private const val NOW_NAME = "feed-check-now"

        fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            )
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        /** 15분은 안드로이드가 허용하는 최소 주기다. 절전 상태에서는 더 늦어질 수 있다. */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val workManager = WorkManager.getInstance(context)
            workManager.enqueueUniquePeriodicWork(
                PERIODIC_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<FeedWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build(),
            )
            workManager.enqueueUniqueWork(
                NOW_NAME,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<FeedWorker>().setConstraints(constraints).build(),
            )
        }
    }
}
