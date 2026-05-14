import type { TFunction } from 'i18next'

export function relativeTime(dateStr: string | null | undefined, t: TFunction): string {
  if (!dateStr) return t('time.unknown')

  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 0) return t('time.justNow')
  if (diff < 5) return t('time.justNow')
  if (diff < 60) return t('time.secondsAgo', { seconds: diff })
  if (diff < 3600) return t('time.minutesAgo', { minutes: Math.floor(diff / 60) })
  if (diff < 86400) return t('time.hoursAgo', { hours: Math.floor(diff / 3600) })
  return t('time.daysAgo', { days: Math.floor(diff / 86400) })
}
