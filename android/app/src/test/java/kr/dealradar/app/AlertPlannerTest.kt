package kr.dealradar.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertPlannerTest {
    private val policy = AlertPolicy(0, 8, morningDigest = false, maxIndividualAlerts = 3)
    private val today = "2026-11-03"

    private fun release(id: String, alert: Boolean = true, date: String = "2026-11-04", watched: Boolean = false) =
        FeedRelease(id, "발매 $id", "https://sibna.kr/$id", date, "10:00", "선착순", watched, alert)

    private fun deal(id: String, alert: Boolean = true) =
        FeedDeal(id, "상품 $id", "쿠팡", "1,000원", "https://ruliweb.com/$id", 5, false, alert)

    private fun run(
        feed: Feed,
        seen: Set<String> = emptySet(),
        initialized: Boolean = true,
        lastDigest: String = today,
        hour: Int = 12,
    ) = AlertPlanner.plan(feed, seen, initialized, lastDigest, today, hour)

    @Test
    fun firstRunMarksEverythingWithoutAlerting() {
        val plan = run(Feed(listOf(release("r1")), listOf(deal("d1")), policy), initialized = false)
        assertTrue(plan.alerts.isEmpty())
        assertEquals(setOf("r1", "d1"), plan.markSeen)
    }

    @Test
    fun onlyUnseenAlertableItemsAreSentWithDirectLinks() {
        val feed = Feed(listOf(release("r1"), release("r2"), release("r3", alert = false)), listOf(deal("d1")), policy)
        val plan = run(feed, seen = setOf("r2"))
        assertEquals(listOf("r1", "d1"), plan.alerts.map { it.key })
        assertEquals("새 발매 · 11/4 10:00 선착순", plan.alerts[0].title)
        assertEquals("https://sibna.kr/r1", plan.alerts[0].url)
        assertEquals("핫딜 · 1,000원", plan.alerts[1].title)
        assertEquals("[쿠팡] 상품 d1", plan.alerts[1].body)
    }

    @Test
    fun manyItemsAreBundledIntoOneNotificationThatOpensTheApp() {
        val feed = Feed((1..4).map { release("r$it") }, listOf(deal("d1")), policy)
        val plan = run(feed)
        assertEquals(1, plan.alerts.size)
        assertEquals("새 소식 5건 (발매 4 · 핫딜 1)", plan.alerts[0].title)
        assertNull(plan.alerts[0].url)
        assertEquals(5, plan.markSeen.size)
    }

    @Test
    fun quietHoursHoldItemsForLater() {
        val feed = Feed(listOf(release("r1")), emptyList(), policy)
        val quiet = run(feed, hour = 3)
        assertTrue(quiet.alerts.isEmpty())
        assertTrue(quiet.markSeen.isEmpty())
        assertEquals(listOf("r1"), run(feed, hour = 8).alerts.map { it.key })
    }

    @Test
    fun quietHoursCanWrapMidnight() {
        val wrap = policy.copy(quietStartHour = 23, quietEndHour = 7)
        assertTrue(AlertPlanner.isQuiet(23, wrap))
        assertTrue(AlertPlanner.isQuiet(6, wrap))
        assertTrue(!AlertPlanner.isQuiet(7, wrap))
    }

    @Test
    fun morningDigestIsSentOncePerDayWithWatchedFirst() {
        val withDigest = policy.copy(morningDigest = true)
        val feed = Feed(
            listOf(release("a", alert = false, date = today), release("b", alert = false, date = today, watched = true)),
            emptyList(),
            withDigest,
        )
        val first = run(feed, lastDigest = "2026-11-02")
        assertEquals(today, first.digestDate)
        assertEquals("오늘 발매 2건", first.alerts.single().title)
        assertTrue(first.alerts.single().body.startsWith("10:00 발매 b"))
        assertTrue(run(feed, lastDigest = today).alerts.isEmpty())
    }

    @Test
    fun parsesFeedAndToleratesMissingOptionalFields() {
        val feed = FeedParser.parse(
            """{"releases":[{"id":"sibna:1","title":"t","url":"https://a","date":"2026-11-04","alert":true}],
               "deals":[{"id":"ruliweb:1","name":"n","url":"https://b"}]}""",
        )
        assertEquals("sibna:1", feed.releases.single().id)
        assertEquals("", feed.releases.single().time)
        assertTrue(feed.releases.single().alert)
        assertEquals(false, feed.deals.single().alert)
        assertEquals(8, feed.policy.quietEndHour)
    }
}
