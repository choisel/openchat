import type { LmStudioClient, LmModel } from './lmstudio-client'
import { parseParamCount } from './model-param-parser'

const CODING_MODEL_KEYWORDS = ['code', 'coder', 'starcoder', 'codellama', 'deepseek-coder', 'wizardcoder']
const CODING_MESSAGE_KEYWORDS = ['code', 'function', 'class', 'bug', 'error', 'debug', 'implement', 'script', 'programming']
const ROUTER_TIMEOUT_MS = 5000

function isCodingModel(model: LmModel): boolean {
  const lower = model.id.toLowerCase()
  return CODING_MODEL_KEYWORDS.some(kw => lower.includes(kw))
}

function isCodingMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return CODING_MESSAGE_KEYWORDS.some(kw => lower.includes(kw))
}

function smallestFirst(a: LmModel, b: LmModel): number {
  return parseParamCount(a.id) - parseParamCount(b.id)
}

function largestFirst(a: LmModel, b: LmModel): number {
  return parseParamCount(b.id) - parseParamCount(a.id)
}

function findModelInResponse(response: string, candidates: LmModel[]): LmModel | undefined {
  return candidates.find(m => response.includes(m.id))
}

export class ModelRouter {
  private lmClient: LmStudioClient
  private consecutiveFailures = 0

  constructor(lmClient: LmStudioClient) {
    this.lmClient = lmClient
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures
  }

  async resolveModel(userMessage: string, loadedModels: LmModel[]): Promise<string> {
    if (loadedModels.length === 0) {
      throw new Error('No models are loaded. Please load at least one model in LM Studio.')
    }

    if (loadedModels.length === 1) {
      this.consecutiveFailures = 0
      return loadedModels[0].id
    }

    if (loadedModels.length === 2) {
      return this.resolveTwoModels(userMessage, loadedModels)
    }

    return this.resolveMultipleModels(userMessage, loadedModels)
  }

  private async resolveTwoModels(userMessage: string, models: LmModel[]): Promise<string> {
    const [a, b] = models
    const aIsCoding = isCodingModel(a)
    const bIsCoding = isCodingModel(b)

    // Unambiguous: exactly one is a coding model
    if (aIsCoding !== bIsCoding) {
      const codingModel = aIsCoding ? a : b
      const generalModel = aIsCoding ? b : a
      this.consecutiveFailures = 0
      if (isCodingMessage(userMessage)) {
        return codingModel.id
      }
      return generalModel.id
    }

    // Ambiguous: both or neither are coding models — ask the smaller one
    const sorted = [...models].sort(smallestFirst)
    const routerModel = sorted[0]
    const otherModel = sorted[1]

    const prompt = buildTwoModelPrompt(a.id, b.id, userMessage)
    const response = await this.callRouter(routerModel.id, prompt)

    const picked = findModelInResponse(response, models)
    if (picked) {
      this.consecutiveFailures = 0
      return picked.id
    }

    // Fallback: larger model
    this.consecutiveFailures++
    return otherModel.id
  }

  private async resolveMultipleModels(userMessage: string, models: LmModel[]): Promise<string> {
    const sorted = [...models].sort(smallestFirst)
    const routerModel = sorted[0]
    const candidates = sorted.slice(1)

    const prompt = buildMultiModelPrompt(candidates.map(m => m.id), userMessage)
    const response = await this.callRouter(routerModel.id, prompt)

    const picked = findModelInResponse(response, candidates)
    if (picked) {
      this.consecutiveFailures = 0
      return picked.id
    }

    // Fallback: largest non-router model
    this.consecutiveFailures++
    const largest = [...candidates].sort(largestFirst)[0]
    return largest.id
  }

  private async callRouter(model: string, prompt: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS)

    let response = ''
    try {
      await this.lmClient.chatStream({
        model,
        messages: [{ role: 'user', content: prompt }],
        onToken: (token) => { response += token },
        signal: controller.signal
      })
    } catch (err) {
      console.warn('[model-router] call to LM Studio failed for model %s:', model, err)
      // Timeout or network error — return empty string to trigger fallback
      return ''
    } finally {
      clearTimeout(timeoutId)
    }

    return response
  }
}

function buildTwoModelPrompt(modelA: string, modelB: string, userMessage: string): string {
  return (
    `You are a model router. Choose one of the two models below that best fits the user's request.\n` +
    `Respond with ONLY the exact model name, nothing else.\n\n` +
    `User request: "${userMessage}"\n\n` +
    `Models:\n- ${modelA}\n- ${modelB}`
  )
}

function buildMultiModelPrompt(candidates: string[], userMessage: string): string {
  const list = candidates.map(n => `- ${n}`).join('\n')
  return (
    `You are a model router. Based on the user message below, choose the most suitable model.\n` +
    `Respond with ONLY the exact model name, nothing else.\n\n` +
    `User message: "${userMessage}"\n\n` +
    `Available models:\n${list}`
  )
}
