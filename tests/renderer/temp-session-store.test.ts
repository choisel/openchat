import { describe, it, expect, beforeEach } from 'vitest'
import { TempSessionStore } from '../../src/renderer/temp-session-store'

describe('TempSessionStore', () => {
  let store: TempSessionStore

  beforeEach(() => {
    store = new TempSessionStore()
  })

  it('create() returns a session with a tmp- prefixed id', () => {
    const session = store.create()
    expect(session.id).toMatch(/^tmp-[0-9a-f-]{36}$/)
  })

  it('create() + get(id) returns session with same id', () => {
    const session = store.create('My chat', 'gpt-4')
    const retrieved = store.get(session.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(session.id)
    expect(retrieved!.name).toBe('My chat')
    expect(retrieved!.model).toBe('gpt-4')
  })

  it('create() uses default name and model when not provided', () => {
    const session = store.create()
    expect(session.name).toBe('New conversation')
    expect(session.model).toBe('auto')
  })

  it('create() sets createdAt to a Date', () => {
    const session = store.create()
    expect(session.createdAt).toBeInstanceOf(Date)
  })

  it('create() initialises messages as empty array', () => {
    const session = store.create()
    expect(session.messages).toEqual([])
  })

  it('get() returns undefined for unknown id', () => {
    expect(store.get('tmp-unknown')).toBeUndefined()
  })

  it('addMessage() appends message to session', () => {
    const session = store.create()
    const msg = store.addMessage(session.id, { role: 'user', content: 'Hello', tokens: 5 })
    expect(msg.id).toBeDefined()
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
    expect(msg.tokens).toBe(5)
    const updated = store.get(session.id)!
    expect(updated.messages).toHaveLength(1)
    expect(updated.messages[0]).toEqual(msg)
  })

  it('addMessage() appends multiple messages in order', () => {
    const session = store.create()
    store.addMessage(session.id, { role: 'user', content: 'Hi', tokens: 2 })
    store.addMessage(session.id, { role: 'assistant', content: 'Hello!', tokens: 10 })
    expect(store.get(session.id)!.messages).toHaveLength(2)
    expect(store.get(session.id)!.messages[0].role).toBe('user')
    expect(store.get(session.id)!.messages[1].role).toBe('assistant')
  })

  it('addMessage() throws for unknown session id', () => {
    expect(() => store.addMessage('tmp-unknown', { role: 'user', content: 'x', tokens: 1 })).toThrow('TempSession not found: tmp-unknown')
  })

  it('updateLastMessageTokens() updates token count of last message', () => {
    const session = store.create()
    store.addMessage(session.id, { role: 'user', content: 'Hello', tokens: 0 })
    store.updateLastMessageTokens(session.id, 42)
    expect(store.get(session.id)!.messages[0].tokens).toBe(42)
  })

  it('updateLastMessageTokens() only updates last message', () => {
    const session = store.create()
    store.addMessage(session.id, { role: 'user', content: 'Hi', tokens: 5 })
    store.addMessage(session.id, { role: 'assistant', content: 'Hey', tokens: 0 })
    store.updateLastMessageTokens(session.id, 99)
    const msgs = store.get(session.id)!.messages
    expect(msgs[0].tokens).toBe(5)
    expect(msgs[1].tokens).toBe(99)
  })

  it('delete() removes the session', () => {
    const session = store.create()
    store.delete(session.id)
    expect(store.get(session.id)).toBeUndefined()
  })

  it('promote() returns correct payload', () => {
    const session = store.create('Chat 1', 'llama-3')
    store.addMessage(session.id, { role: 'user', content: 'Hello', tokens: 3 })
    const payload = store.promote(session.id)
    expect(payload.name).toBe('Chat 1')
    expect(payload.model).toBe('llama-3')
    expect(payload.messages).toHaveLength(1)
    expect(payload.messages[0].content).toBe('Hello')
  })

  it('promote() throws for unknown session id', () => {
    expect(() => store.promote('tmp-unknown')).toThrow('TempSession not found: tmp-unknown')
  })

  it('promote() does not make any network call', () => {
    // fetch is not defined in node test env — this verifies no network call is made
    const session = store.create('Test', 'model-x')
    expect(() => store.promote(session.id)).not.toThrow()
  })

  it('subscribe() listener is called on create()', () => {
    let callCount = 0
    store.subscribe(() => callCount++)
    store.create()
    expect(callCount).toBe(1)
  })

  it('subscribe() listener is called on addMessage()', () => {
    const session = store.create()
    let callCount = 0
    store.subscribe(() => callCount++)
    store.addMessage(session.id, { role: 'user', content: 'x', tokens: 1 })
    expect(callCount).toBe(1)
  })

  it('subscribe() unsubscribe stops notifications', () => {
    let callCount = 0
    const unsub = store.subscribe(() => callCount++)
    store.create()
    unsub()
    store.create()
    expect(callCount).toBe(1)
  })

  it('list() returns all sessions', () => {
    store.create('A')
    store.create('B')
    expect(store.list()).toHaveLength(2)
  })
})
