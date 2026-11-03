package kr.dealradar.app

import org.json.JSONArray
import org.json.JSONObject

data class FeedRelease(
    val id: String,
    val title: String,
    val url: String,
    val date: String,
    val time: String,
    val method: String,
    val watched: Boolean,
    val alert: Boolean,
)

data class FeedDeal(
    val id: String,
    val name: String,
    val store: String,
    val price: String,
    val url: String,
    val recommend: Int,
    val watched: Boolean,
    val alert: Boolean,
)

data class AlertPolicy(
    val quietStartHour: Int,
    val quietEndHour: Int,
    val morningDigest: Boolean,
    val maxIndividualAlerts: Int,
)

data class Feed(val releases: List<FeedRelease>, val deals: List<FeedDeal>, val policy: AlertPolicy)

/** url 이 null 이면 알림을 눌렀을 때 앱을 연다. */
data class Alert(val key: String, val title: String, val body: String, val url: String?)

data class AlertPlan(val alerts: List<Alert>, val markSeen: Set<String>, val digestDate: String?)

/** 안드로이드에 의존하지 않는 알림 판단 로직. 시간은 모두 KST 값으로 받는다. */
object AlertPlanner {
    fun isQuiet(hour: Int, policy: AlertPolicy): Boolean {
        val start = policy.quietStartHour
        val end = policy.quietEndHour
        return if (start <= end) hour in start until end else hour >= start || hour < end
    }

    fun plan(
        feed: Feed,
        seen: Set<String>,
        initialized: Boolean,
        lastDigestDate: String,
        today: String,
        hour: Int,
    ): AlertPlan {
        val releases = feed.releases.filter { it.alert && it.id !in seen }
        val deals = feed.deals.filter { it.alert && it.id !in seen }
        val freshIds = (releases.map { it.id } + deals.map { it.id }).toSet()

        // 설치 직후에는 이미 있던 글을 한꺼번에 울리지 않는다.
        if (!initialized) return AlertPlan(emptyList(), freshIds, null)

        // 조용한 시간에는 표시만 미룬다. 다음 실행 때 다시 대상이 된다.
        if (isQuiet(hour, feed.policy)) return AlertPlan(emptyList(), emptySet(), null)

        val alerts = mutableListOf<Alert>()
        var digestDate: String? = null
        if (feed.policy.morningDigest && lastDigestDate != today) {
            digestDate = today
            digest(feed, today)?.let { alerts += it }
        }
        alerts += newItemAlerts(releases, deals, feed.policy.maxIndividualAlerts)
        return AlertPlan(alerts, freshIds, digestDate)
    }

    private fun digest(feed: Feed, today: String): Alert? {
        val items = feed.releases.filter { it.date == today }
        if (items.isEmpty()) return null
        val lines = items.sortedByDescending { it.watched }.take(6)
            .joinToString("\n") { "${it.time.ifEmpty { "미정" }} ${it.title}" }
        return Alert("digest-$today", "오늘 발매 ${items.size}건", lines, null)
    }

    private fun newItemAlerts(
        releases: List<FeedRelease>,
        deals: List<FeedDeal>,
        maxIndividual: Int,
    ): List<Alert> {
        val total = releases.size + deals.size
        if (total == 0) return emptyList()

        if (total <= maxIndividual) {
            return releases.map { release ->
                val whenText = listOf(shortDate(release.date), release.time, release.method)
                    .filter { it.isNotEmpty() }.joinToString(" ")
                Alert(release.id, "새 발매 · $whenText", release.title, release.url)
            } + deals.map { deal ->
                val head = if (deal.price.isEmpty()) "핫딜" else "핫딜 · ${deal.price}"
                Alert(deal.id, head, dealLabel(deal), deal.url)
            }
        }

        val lines = releases.sortedByDescending { it.watched }.map { it.title } +
            deals.sortedWith(compareByDescending<FeedDeal> { it.watched }.thenByDescending { it.recommend })
                .map { dealLabel(it) }
        val summary = listOf(
            if (releases.isEmpty()) "" else "발매 ${releases.size}",
            if (deals.isEmpty()) "" else "핫딜 ${deals.size}",
        ).filter { it.isNotEmpty() }.joinToString(" · ")
        return listOf(Alert("bundle-${releases.size + deals.size}-${lines.first().hashCode()}", "새 소식 ${total}건 ($summary)", lines.take(6).joinToString("\n"), null))
    }

    private fun dealLabel(deal: FeedDeal) =
        if (deal.store.isEmpty()) deal.name else "[${deal.store}] ${deal.name}"

    private fun shortDate(ymd: String): String {
        val parts = ymd.split("-")
        return if (parts.size == 3) "${parts[1].toInt()}/${parts[2].toInt()}" else ymd
    }
}

object FeedParser {
    fun parse(text: String): Feed {
        val root = JSONObject(text)
        val policy = root.optJSONObject("alertPolicy")
        return Feed(
            releases = root.optJSONArray("releases").objects().map {
                FeedRelease(
                    id = it.getString("id"),
                    title = it.getString("title"),
                    url = it.getString("url"),
                    date = it.getString("date"),
                    time = it.optString("time"),
                    method = it.optString("method"),
                    watched = it.optBoolean("watched"),
                    alert = it.optBoolean("alert"),
                )
            },
            deals = root.optJSONArray("deals").objects().map {
                FeedDeal(
                    id = it.getString("id"),
                    name = it.getString("name"),
                    store = it.optString("store"),
                    price = it.optString("price"),
                    url = it.getString("url"),
                    recommend = it.optInt("recommend"),
                    watched = it.optBoolean("watched"),
                    alert = it.optBoolean("alert"),
                )
            },
            policy = AlertPolicy(
                quietStartHour = policy?.optInt("quietStartHour", 0) ?: 0,
                quietEndHour = policy?.optInt("quietEndHour", 8) ?: 8,
                morningDigest = policy?.optBoolean("morningDigest", true) ?: true,
                maxIndividualAlerts = policy?.optInt("maxIndividualAlerts", 3) ?: 3,
            ),
        )
    }

    private fun JSONArray?.objects(): List<JSONObject> =
        if (this == null) emptyList() else (0 until length()).map { getJSONObject(it) }
}
