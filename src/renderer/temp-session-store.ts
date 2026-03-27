import { useState, useEffect } from 'react'

export interface TempMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tokens: number
}

export interface TempSession {
  id: string
  name: string
  model: string
  messages: TempMessage[]
  createdAt: Date
}

type StoreListener = (sessions: TempSession[]) => void

export class TempSessionStore {
  private sessions: Map<string, TempSession> = new Map()
  private listeners: Set<StoreListener> = new Set()

  private notify(): void {
    const list = Array.from(this.sessions.values())
    for (const listener of this.listeners) {
      listener(list)
    }
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  list(): TempSession[] {
    return Array.from(this.sessions.values())
  }

  create(name?: string, model?: string): TempSession {
    const session: TempSession = {
      id: `tmp-${crypto.randomUUID()}`,
      name: name ?? 'New conversation',
      model: model ?? 'auto',
      messages: [],
      createdAt: new Date(),
    }
    this.sessions.set(session.id, session)
    this.notify()
    return session
  }

  get(id: string): TempSession | undefined {
    return this.sessions.get(id)
  }

  addMessage(id: string, msg: Omit<TempMessage, 'id'>): TempMessage {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`TempSession not found: ${id}`)
    }
    const message: TempMessage = { id: crypto.randomUUID(), ...msg }
    session.messages.push(message)
    this.notify()
    return message
  }

  updateLastMessageTokens(id: string, exact: number): void {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`TempSession not found: ${id}`)
    }
    const last = session.messages[session.messages.length - 1]
    if (last) {
      last.tokens = exact
      this.notify()
    }
  }

  delete(id: string): void {
    this.sessions.delete(id)
    this.notify()
  }

  promote(id: string): { name: string; model: string; messages: TempMessage[] } {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`TempSession not found: ${id}`)
    }
    return {
      name: session.name,
      model: session.model,
      messages: session.messages,
    }
  }
}

export const tempSessionStore = new TempSessionStore()

export function useTempSessions(): [TempSession[], TempSessionStore] {
  const [sessions, setSessions] = useState<TempSession[]>(() => tempSessionStore.list())

  useEffect(() => {
    const unsubscribe = tempSessionStore.subscribe(setSessions)
    return unsubscribe
  }, [])

  return [sessions, tempSessionStore]
}
