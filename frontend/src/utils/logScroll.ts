/** Distance from bottom (px) to treat log list as "following" new lines. */
export const LOG_STICK_BOTTOM_THRESHOLD_PX = 80

export function isLogContainerNearBottom(
  el: HTMLElement,
  thresholdPx: number = LOG_STICK_BOTTOM_THRESHOLD_PX
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx
}
