import { kst, matchesAny } from '../lib/util.mjs';

export function isDealAlertable(deal, config) {
  const { dealOnBest, dealMinRecommend } = config.notify;
  return (dealOnBest && deal.best)
    || deal.recommend >= dealMinRecommend
    || matchesAny(deal.title, config.watchKeywords);
}

export function isReleaseAlertable(release, config, now) {
  const { date, time } = kst(now);
  if (release.date < date) return false;
  if (release.date === date && release.time && release.time < time) return false;
  return config.notify.releases === 'all' || matchesAny(release.title, config.watchKeywords);
}
