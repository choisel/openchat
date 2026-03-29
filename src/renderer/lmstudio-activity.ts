/**
 * Tracks last LM Studio activity time so the status poller can back off
 * when real requests are in flight.
 */
let lastActivityAt = 0

export function recordLmActivity() {
  lastActivityAt = Date.now()
}

export function getLastActivityAt() {
  return lastActivityAt
}
