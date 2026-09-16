export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct'
export const COMPANY_CHAT_COST_MODE = 'local_ollama_plus_free_web_retrieval'
const OLLAMA_TIMEOUT_MS = 300_000
const OLLAMA_HEALTH_TIMEOUT_MS = 5000
const OLLAMA_WARMUP_TIMEOUT_MS = 120_000

export class OllamaUnavailableError extends Error {
  code = 'OLLAMA_NOT_RUNNING'

  constructor() {
    super('Local model is not running. Start Ollama and retry.')
    this.name = 'OllamaUnavailableError'
  }
}

export class OllamaModelMissingError extends Error {
  code = 'OLLAMA_MODEL_MISSING'

  constructor(model = DEFAULT_OLLAMA_MODEL) {
    super(`Local model is not installed. Run ollama pull ${model}.`)
    this.name = 'OllamaModelMissingError'
  }
}

export class OllamaTimeoutError extends Error {
  code = 'OLLAMA_TIMEOUT'

  constructor() {
    super('Local model took too long. Retry or use a smaller model.')
    this.name = 'OllamaTimeoutError'
  }
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '')
}

function isConnectionFailure(error) {
  const message = String(error?.message ?? error).toLowerCase()
  const causeCode = error?.cause?.code
  return (
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ENOTFOUND' ||
    causeCode === 'EHOSTUNREACH' ||
    message.includes('fetch failed') ||
    message.includes('connection refused')
  )
}

function createRequestSignal(externalSignal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('timeout'))
  }, timeoutMs)

  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout)
      externalSignal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

async function throwForOllamaResponse(response, model) {
  if (response.ok) return
  const detail = await response.text().catch(() => '')
  if (response.status === 404 && /model|not found/i.test(detail)) {
    throw new OllamaModelMissingError(model)
  }
  throw new Error(
    `Local Ollama request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`,
  )
}

function normalizeOllamaError(error, requestSignal) {
  if (
    error instanceof OllamaUnavailableError ||
    error instanceof OllamaModelMissingError ||
    error instanceof OllamaTimeoutError
  ) {
    return error
  }
  if (requestSignal.didTimeOut()) return new OllamaTimeoutError()
  if (isConnectionFailure(error)) return new OllamaUnavailableError()
  return error
}

export function createOllamaProvider(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.OLLAMA_BASE_URL)
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL
  const fetchImpl = options.fetchImpl ?? fetch
  const requestTimeoutMs = options.timeoutMs ?? OLLAMA_TIMEOUT_MS

  return {
    id: 'ollama',
    baseUrl,
    model,
    costMode: COMPANY_CHAT_COST_MODE,

    async health() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), OLLAMA_HEALTH_TIMEOUT_MS)

      try {
        const response = await fetchImpl(`${baseUrl}/api/tags`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Local Ollama health check returned HTTP ${response.status}.`)
        }

        const payload = await response.json()
        const models = (payload?.models ?? [])
          .map((item) => item?.name ?? item?.model)
          .filter(Boolean)

        return {
          available: true,
          modelAvailable: models.some(
            (installedModel) =>
              installedModel === model ||
              installedModel === `${model}:latest` ||
              installedModel.startsWith(`${model}:`),
          ),
          models,
        }
      } catch (error) {
        if (isConnectionFailure(error)) {
          return { available: false, modelAvailable: false, models: [] }
        }
        throw error
      } finally {
        clearTimeout(timeout)
      }
    },

    async chat(messages, options = {}) {
      const requestSignal = createRequestSignal(options.signal, requestTimeoutMs)
      const useNativeApi = options.native === true

      try {
        const response = await fetchImpl(`${baseUrl}${useNativeApi ? '/api/chat' : '/v1/chat/completions'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(useNativeApi
            ? {
                model,
                messages,
                stream: false,
                ...(options.responseFormat ? { format: 'json' } : {}),
                options: {
                  temperature: options.temperature ?? 0.2,
                  num_predict: options.maxTokens ?? 700,
                  ...(options.numCtx ? { num_ctx: options.numCtx } : {}),
                },
              }
            : {
                model,
                messages,
                temperature: options.temperature ?? 0.2,
                max_tokens: options.maxTokens ?? 700,
                ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
                stream: false,
              }),
          signal: requestSignal.signal,
        })

        await throwForOllamaResponse(response, model)

        const payload = await response.json()
        const answer = (
          useNativeApi
            ? payload?.message?.content
            : payload?.choices?.[0]?.message?.content
        )?.trim()
        if (!answer) throw new Error('Local Ollama returned an empty answer.')
        return answer
      } catch (error) {
        throw normalizeOllamaError(error, requestSignal)
      } finally {
        requestSignal.cleanup()
      }
    },

    async *streamChat(messages, options = {}) {
      const requestSignal = createRequestSignal(options.signal, requestTimeoutMs)

      try {
        const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            temperature: options.temperature ?? 0.2,
            max_tokens: options.maxTokens ?? 700,
            stream: true,
          }),
          signal: requestSignal.signal,
        })

        await throwForOllamaResponse(response, model)
        if (!response.body) throw new Error('Local Ollama returned an empty stream.')

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (!data || data === '[DONE]') continue
            const payload = JSON.parse(data)
            const token = payload?.choices?.[0]?.delta?.content
            if (token) yield token
          }
        }
        buffer += decoder.decode()
        for (const line of buffer.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue
          const payload = JSON.parse(data)
          const token = payload?.choices?.[0]?.delta?.content
          if (token) yield token
        }
      } catch (error) {
        throw normalizeOllamaError(error, requestSignal)
      } finally {
        requestSignal.cleanup()
      }
    },

    async warmup(options = {}) {
      const warmupProvider = createOllamaProvider({
        baseUrl,
        model,
        fetchImpl,
        timeoutMs: options.timeoutMs ?? OLLAMA_WARMUP_TIMEOUT_MS,
      })
      await warmupProvider.chat(
        [
          { role: 'system', content: 'Reply with only: ready' },
          { role: 'user', content: 'ready' },
        ],
        { signal: options.signal },
      )
      return {
        ready: true,
        model,
        cost_mode: COMPANY_CHAT_COST_MODE,
      }
    },
  }
}
