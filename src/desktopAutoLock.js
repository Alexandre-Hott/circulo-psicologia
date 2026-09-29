export const DESKTOP_AUTO_LOCK_MS = 15 * 60 * 1000

export function createAutoLockController({
  timeoutMs = DESKTOP_AUTO_LOCK_MS,
  onExpire,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
  eventTarget = window,
  documentTarget = document,
}) {
  let timer = null
  let active = false
  let expired = false
  let generation = 0
  let sawBlur = false
  let sawHidden = false
  let lastMotionAt = -Infinity
  let lastPointer = null

  const schedule = () => {
    if (!active || expired) return
    if (timer !== null) clearTimer(timer)
    timer = setTimer(() => {
      timer = null
      if (!active || expired) return
      expired = true
      Promise.resolve(onExpire(generation)).catch(() => {})
    }, timeoutMs)
  }
  const activity = event => {
    if (event?.isTrusted === false) return
    generation++
    expired = false
    schedule()
  }
  const onPointerMove = event => {
    if (event?.isTrusted === false) return
    const currentTime = now()
    const point = [event.clientX, event.clientY]
    if (lastPointer && Math.hypot(point[0] - lastPointer[0], point[1] - lastPointer[1]) < 8) return
    if (currentTime - lastMotionAt < 1000) return
    lastMotionAt = currentTime
    lastPointer = point
    activity(event)
  }
  const onScroll = event => {
    if (event?.isTrusted === false) return
    const currentTime = now()
    if (currentTime - lastMotionAt < 1000) return
    lastMotionAt = currentTime
    activity(event)
  }
  const onBlur = () => { sawBlur = true }
  const onFocus = event => {
    if (sawBlur) { sawBlur = false; activity(event) }
  }
  const onVisibility = event => {
    if (documentTarget.visibilityState === 'hidden') sawHidden = true
    else if (sawHidden) { sawHidden = false; activity(event) }
  }
  const start = () => {
    if (active) return
    active = true
    expired = false
    lastMotionAt = -Infinity
    lastPointer = null
    eventTarget.addEventListener('keydown', activity, true)
    eventTarget.addEventListener('pointerdown', activity, true)
    eventTarget.addEventListener('touchstart', activity, true)
    eventTarget.addEventListener('pointermove', onPointerMove, { capture: true, passive: true })
    eventTarget.addEventListener('scroll', onScroll, { capture: true, passive: true })
    eventTarget.addEventListener('blur', onBlur)
    eventTarget.addEventListener('focus', onFocus)
    documentTarget.addEventListener('visibilitychange', onVisibility)
    sawBlur = false
    sawHidden = documentTarget.visibilityState === 'hidden'
    schedule()
  }
  const stop = () => {
    if (!active) return
    active = false
    if (timer !== null) clearTimer(timer)
    timer = null
    eventTarget.removeEventListener('keydown', activity, true)
    eventTarget.removeEventListener('pointerdown', activity, true)
    eventTarget.removeEventListener('touchstart', activity, true)
    eventTarget.removeEventListener('pointermove', onPointerMove, true)
    eventTarget.removeEventListener('scroll', onScroll, true)
    eventTarget.removeEventListener('blur', onBlur)
    eventTarget.removeEventListener('focus', onFocus)
    documentTarget.removeEventListener('visibilitychange', onVisibility)
  }
  const resume = () => { if (active) { generation++; expired = false; schedule() } }
  return { start, stop, activity, resume, isCurrent: value => active && generation === value, get active() { return active } }
}
