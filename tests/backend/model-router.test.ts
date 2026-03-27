import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModelRouter } from '../../src/backend/model-router'
import type { LmStudioClient, LmModel } from '../../src/backend/lmstudio-client'

function makeModel(id: string): LmModel {
  return { id, owned_by: 'local' }
}

function makeMockClient(responseText = ''): LmStudioClient {
  return {
    listModels: vi.fn(),
    checkConnection: vi.fn(),
    chatStream: vi.fn(async ({ onToken }) => {
      onToken(responseText)
      return {}
    })
  }
}

describe('ModelRouter', () => {
  describe('0 models — throws error', () => {
    it('throws when no models are loaded', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      await expect(router.resolveModel('hello', [])).rejects.toThrow()
    })
  })

  describe('1 model — direct return', () => {
    it('returns the only model directly without calling the client', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      const result = await router.resolveModel('hello', [makeModel('mistral-7b')])
      expect(result).toBe('mistral-7b')
      expect(client.chatStream).not.toHaveBeenCalled()
    })

    it('resets consecutiveFailures to 0 on success', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      // Force a failure state by calling with 0 models (will throw, so we catch)
      // We test reset via the public getter after a successful call
      await router.resolveModel('hello', [makeModel('mistral-7b')])
      expect(router.getConsecutiveFailures()).toBe(0)
    })
  })

  describe('2 models — unambiguous (one coding, one general)', () => {
    const codingModel = makeModel('deepseek-coder-6.7b')
    const generalModel = makeModel('mistral-7b')
    const models = [codingModel, generalModel]

    it('routes a coding message to the coding model', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      const result = await router.resolveModel('can you help me fix this bug?', models)
      expect(result).toBe('deepseek-coder-6.7b')
      expect(client.chatStream).not.toHaveBeenCalled()
    })

    it('routes a non-coding message to the general model', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      const result = await router.resolveModel('what is the weather today?', models)
      expect(result).toBe('mistral-7b')
      expect(client.chatStream).not.toHaveBeenCalled()
    })

    it('is case-insensitive for coding keywords in the model id', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      const result = await router.resolveModel('write a function', [
        makeModel('CodeLlama-13b'),
        makeModel('mistral-7b')
      ])
      expect(result).toBe('CodeLlama-13b')
    })

    it('is case-insensitive for coding keywords in user message', async () => {
      const client = makeMockClient()
      const router = new ModelRouter(client)
      const result = await router.resolveModel('help me DEBUG this issue', models)
      expect(result).toBe('deepseek-coder-6.7b')
    })
  })

  describe('2 models — ambiguous (both or neither match coding classifier)', () => {
    it('routes to coding model when LLM response names it (both are coding models)', async () => {
      const m1 = makeModel('deepseek-coder-7b')
      const m2 = makeModel('codellama-13b')
      const client = makeMockClient('deepseek-coder-7b')
      const router = new ModelRouter(client)
      const result = await router.resolveModel('explain quantum computing', [m1, m2])
      expect(result).toBe('deepseek-coder-7b')
      expect(client.chatStream).toHaveBeenCalledOnce()
    })

    it('routes to larger model as fallback when LLM response is unrecognisable (both coding)', async () => {
      const m1 = makeModel('deepseek-coder-7b')
      const m2 = makeModel('codellama-13b')
      const client = makeMockClient('I cannot decide')
      const router = new ModelRouter(client)
      const result = await router.resolveModel('explain quantum computing', [m1, m2])
      // fallback = larger model = codellama-13b (13 > 7)
      expect(result).toBe('codellama-13b')
    })

    it('increments consecutiveFailures when fallback is used (bad LLM response)', async () => {
      const m1 = makeModel('deepseek-coder-7b')
      const m2 = makeModel('codellama-13b')
      const client = makeMockClient('I cannot decide')
      const router = new ModelRouter(client)
      await router.resolveModel('explain quantum computing', [m1, m2])
      expect(router.getConsecutiveFailures()).toBe(1)
    })

    it('routes to larger model as fallback on router timeout (both coding)', async () => {
      const m1 = makeModel('deepseek-coder-7b')
      const m2 = makeModel('codellama-13b')
      const client: LmStudioClient = {
        listModels: vi.fn(),
        checkConnection: vi.fn(),
        chatStream: vi.fn(async ({ signal }) => {
          // Simulate a timeout by waiting for the signal to abort
          await new Promise<void>((_, reject) => {
            signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
          return {}
        })
      }
      const router = new ModelRouter(client)
      const result = await router.resolveModel('explain quantum computing', [m1, m2])
      // fallback = larger model = codellama-13b
      expect(result).toBe('codellama-13b')
      expect(router.getConsecutiveFailures()).toBe(1)
    }, 10000)

    it('routes to general model when neither are coding models', async () => {
      const m1 = makeModel('mistral-7b')
      const m2 = makeModel('llama-13b')
      const client = makeMockClient('mistral-7b')
      const router = new ModelRouter(client)
      const result = await router.resolveModel('what is the capital of France?', [m1, m2])
      expect(result).toBe('mistral-7b')
    })

    it('resets consecutiveFailures to 0 after a successful LLM routing', async () => {
      const m1 = makeModel('deepseek-coder-7b')
      const m2 = makeModel('codellama-13b')
      // First call fails (bad response)
      const clientBad = makeMockClient('garbage')
      const router = new ModelRouter(clientBad)
      await router.resolveModel('question', [m1, m2])
      expect(router.getConsecutiveFailures()).toBe(1)

      // Second call succeeds (valid model name in response)
      const clientGood = makeMockClient('deepseek-coder-7b')
      const router2 = new ModelRouter(clientGood)
      // inject failure state manually via a bad prior call, then succeed
      // Instead: create a new router, force a failure, then use a good response
      // We'll directly test via consecutive calls using a router that can switch mocks
      // Use a counter-based mock
      let callCount = 0
      const responses = ['garbage', 'deepseek-coder-7b']
      const flexClient: LmStudioClient = {
        listModels: vi.fn(),
        checkConnection: vi.fn(),
        chatStream: vi.fn(async ({ onToken }) => {
          onToken(responses[callCount++])
          return {}
        })
      }
      const flexRouter = new ModelRouter(flexClient)
      await flexRouter.resolveModel('question', [m1, m2]) // fails → counter = 1
      expect(flexRouter.getConsecutiveFailures()).toBe(1)
      await flexRouter.resolveModel('question', [m1, m2]) // succeeds → counter = 0
      expect(flexRouter.getConsecutiveFailures()).toBe(0)
    })
  })

  describe('3+ models — smallest model is router', () => {
    const models = [
      makeModel('llama-70b'),
      makeModel('mistral-7b'),
      makeModel('phi-2b')
    ]

    it('routes using LLM response containing exact model name', async () => {
      const client = makeMockClient('llama-70b')
      const router = new ModelRouter(client)
      const result = await router.resolveModel('summarize this document', models)
      expect(result).toBe('llama-70b')
      // phi-2b is the router (smallest), so chatStream called with phi-2b
      expect(client.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'phi-2b' })
      )
    })

    it('fallback to largest non-router model when LLM response has no valid name', async () => {
      const client = makeMockClient('I do not know')
      const router = new ModelRouter(client)
      const result = await router.resolveModel('summarize this document', models)
      // non-router models: llama-70b (70), mistral-7b (7)
      // largest non-router = llama-70b
      expect(result).toBe('llama-70b')
      expect(router.getConsecutiveFailures()).toBe(1)
    })

    it('fallback to largest non-router model on timeout', async () => {
      const client: LmStudioClient = {
        listModels: vi.fn(),
        checkConnection: vi.fn(),
        chatStream: vi.fn(async ({ signal }) => {
          await new Promise<void>((_, reject) => {
            signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
          return {}
        })
      }
      const router = new ModelRouter(client)
      const result = await router.resolveModel('summarize this document', models)
      expect(result).toBe('llama-70b')
      expect(router.getConsecutiveFailures()).toBe(1)
    }, 10000)

    it('resets consecutiveFailures to 0 after successful 3+ routing', async () => {
      let callCount = 0
      const responses = ['no idea', 'llama-70b']
      const client: LmStudioClient = {
        listModels: vi.fn(),
        checkConnection: vi.fn(),
        chatStream: vi.fn(async ({ onToken }) => {
          onToken(responses[callCount++])
          return {}
        })
      }
      const router = new ModelRouter(client)
      await router.resolveModel('question', models)
      expect(router.getConsecutiveFailures()).toBe(1)
      await router.resolveModel('question', models)
      expect(router.getConsecutiveFailures()).toBe(0)
    })

    it('excludes the router model from candidates in the prompt', async () => {
      let capturedMessages: { role: string; content: string }[] = []
      const client: LmStudioClient = {
        listModels: vi.fn(),
        checkConnection: vi.fn(),
        chatStream: vi.fn(async ({ messages, onToken }) => {
          capturedMessages = messages
          onToken('llama-70b')
          return {}
        })
      }
      const router = new ModelRouter(client)
      await router.resolveModel('summarize this document', models)
      // phi-2b is router, should not appear as a candidate
      const promptContent = capturedMessages.map(m => m.content).join(' ')
      expect(promptContent).toContain('llama-70b')
      expect(promptContent).toContain('mistral-7b')
      expect(promptContent).not.toContain('phi-2b')
    })
  })
})
