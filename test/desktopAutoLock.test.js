import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutoLockController } from '../src/desktopAutoLock.js'

class Events {
  listeners = new Map()
  addEventListener(name, fn) { const set = this.listeners.get(name) || new Set(); set.add(fn); this.listeners.set(name, set) }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn) }
  emit(name, extra = {}) { for (const fn of this.listeners.get(name) || []) fn({ isTrusted: true, ...extra }) }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0) }
}

function fixture(timeoutMs = 100) {
  let now = 0
  let nextId = 1
  const timers = new Map()
  const target = new Events()
  const doc = new Events()
  doc.visibilityState = 'visible'
  let expired = 0
  let expiredGeneration = null
  const controller = createAutoLockController({
    timeoutMs,
    onExpire: generation => { expired++; expiredGeneration = generation },
    eventTarget: target,
    documentTarget: doc,
    setTimer: (fn, delay) => { const id = nextId++; timers.set(id, { at: now + delay, fn }); return id },
    clearTimer: id => timers.delete(id),
    now: () => now,
  })
  const advance = ms => {
    const end = now + ms
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next || next[1].at > end) break
      now = next[1].at; timers.delete(next[0]); next[1].fn()
    }
    now = end
  }
  return { controller, target, doc, advance, expired: () => expired, expiredGeneration: () => expiredGeneration, timerCount: () => timers.size }
}

test('idle timer starts once, trusted keyboard/pointer/touch, throttled movement and scroll reset it', () => {
  const f = fixture()
  f.controller.start(); f.advance(60); f.target.emit('keydown'); f.advance(60)
  assert.equal(f.expired(), 0)
  f.target.emit('pointerdown'); f.advance(60)
  assert.equal(f.expired(), 0)
  f.target.emit('touchstart'); f.advance(99)
  assert.equal(f.expired(), 0)
  f.target.emit('pointermove', { clientX: 20, clientY: 20 }); f.advance(40)
  f.target.emit('pointermove', { clientX: 24, clientY: 24 }); f.advance(1)
  f.target.emit('scroll'); f.advance(40)
  assert.equal(f.expired(), 0)
  f.advance(19)
  assert.equal(f.expired(), 1)
})

test('activity invalidates an expired lock request and the renewed idle window can expire later', () => {
  const f = fixture(100)
  f.controller.start()
  f.advance(100)
  const generationAtExpiry = f.expiredGeneration()
  assert.equal(f.controller.isCurrent(generationAtExpiry), true)
  f.target.emit('keydown')
  assert.equal(f.controller.isCurrent(generationAtExpiry), false)
  f.advance(99); assert.equal(f.expired(), 1)
  f.advance(1); assert.equal(f.expired(), 2)
})

test('return from blur or hidden visibility invalidates a queued expiration and starts a fresh window', () => {
  const f = fixture(100)
  f.controller.start(); f.advance(100)
  const blurGeneration = f.expiredGeneration()
  f.target.emit('blur'); f.target.emit('focus')
  assert.equal(f.controller.isCurrent(blurGeneration), false)
  f.advance(100); assert.equal(f.expired(), 2)
  const visibilityGeneration = f.expiredGeneration()
  f.doc.visibilityState = 'hidden'; f.doc.emit('visibilitychange')
  f.doc.visibilityState = 'visible'; f.doc.emit('visibilitychange')
  assert.equal(f.controller.isCurrent(visibilityGeneration), false)
  f.advance(100); assert.equal(f.expired(), 3)
})

test('trusted pointer movement and scrolling count as activity; synthetic events and small movement are ignored', () => {
  const f = fixture(10000)
  f.controller.start(); f.advance(6000)
  f.target.emit('pointermove', { clientX: 20, clientY: 20 }); f.advance(1000)
  assert.equal(f.expired(), 0)
  f.target.emit('pointermove', { clientX: 24, clientY: 24 }); f.advance(999)
  assert.equal(f.expired(), 0)
  f.advance(9000)
  assert.equal(f.expired(), 1)
  const scroll = fixture(5000)
  scroll.controller.start(); scroll.advance(4000)
  scroll.target.emit('scroll'); scroll.advance(1000)
  assert.equal(scroll.expired(), 0)
  scroll.advance(4000)
  scroll.target.emit('scroll', { isTrusted: false }); scroll.advance(1000)
  assert.equal(scroll.expired(), 1)
})

test('initial focus does not reset or expire early; return after a real blur/hidden state resets timer', () => {
  const f = fixture()
  f.controller.start(); f.target.emit('focus'); f.doc.emit('visibilitychange'); f.advance(80)
  f.target.emit('blur'); f.target.emit('focus'); f.advance(80)
  assert.equal(f.expired(), 0)
  f.doc.visibilityState = 'hidden'; f.doc.emit('visibilitychange')
  f.doc.visibilityState = 'visible'; f.doc.emit('visibilitychange'); f.advance(99)
  assert.equal(f.expired(), 0)
  f.advance(1); assert.equal(f.expired(), 1)
})

test('stop clears the timer and every listener; restart begins a fresh timeout', () => {
  const f = fixture()
  f.controller.start(); f.controller.start()
  assert.equal(f.target.count(), 7)
  assert.equal(f.doc.count(), 1)
  f.controller.stop(); f.controller.stop()
  assert.equal(f.target.count(), 0)
  assert.equal(f.doc.count(), 0)
  assert.equal(f.timerCount(), 0)
  f.advance(1000); assert.equal(f.expired(), 0)
  f.controller.start(); f.advance(100); assert.equal(f.expired(), 1)
})
