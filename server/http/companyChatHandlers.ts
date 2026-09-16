import {
  CompanyChatRequestError,
  runCompanyChat,
  runCompanyChatStream,
  warmupCompanyChat,
} from '../companyChat.ts'
import {
  getCompanyChatHealth,
  getCompanyChatHealthFallback,
} from '../llm/index.ts'
import { COMPANY_CHAT_COST_MODE } from '../llm/ollama.ts'

const MAX_REQUEST_BODY_BYTES = 1_000_000

function sendJson(res, statusCode, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(statusCode).json(payload)
    return
  }
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function methodNotAllowed(res, allowedMethod) {
  res.setHeader('Allow', allowedMethod)
  sendJson(res, 405, {
    error: `Method not allowed. Use ${allowedMethod}.`,
  })
}

function createRequestAbortController(req, res) {
  const controller = new AbortController()
  req.on?.('aborted', () => controller.abort())
  res.on?.('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  return controller
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

async function readJsonBody(req) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new CompanyChatRequestError('Request body is too large.', 413)
    }
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    throw new CompanyChatRequestError('Request body must be valid JSON.', 400)
  }
}

function requestErrorStatus(error) {
  return error instanceof CompanyChatRequestError
    ? error.statusCode
    : error?.statusCode ?? 500
}

function requestErrorPayload(error, fallbackMessage) {
  return {
    error: error?.message || fallbackMessage,
    cost_mode: COMPANY_CHAT_COST_MODE,
  }
}

export async function handleCompanyChatRequest(req, res, options = {}) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST')
    return
  }

  const wantsStream = String(req.headers?.accept ?? '').includes('text/event-stream')
  const controller = createRequestAbortController(req, res)

  try {
    const body = options.body ?? await readJsonBody(req)
    if (!wantsStream) {
      sendJson(res, 200, await runCompanyChat(body, {
        signal: controller.signal,
      }))
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const stream = await runCompanyChatStream(body, {
      signal: controller.signal,
    })
    writeEvent(res, 'context', {
      sources: stream.sources,
      used_context: stream.used_context,
      cost_mode: stream.cost_mode,
      context_quality: stream.context_quality,
      retrieval_notice: stream.retrieval_notice,
      web_search_enabled: stream.web_search_enabled,
      web_search_available: stream.web_search_available,
    })

    let answer = ''
    for await (const token of stream.tokens()) {
      if (controller.signal.aborted) break
      answer += token
      writeEvent(res, 'token', { token })
    }
    if (!controller.signal.aborted) {
      writeEvent(res, 'done', stream.finalize(answer))
      res.end()
    }
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return
    const payload = requestErrorPayload(error, 'Company chat request failed.')
    if (wantsStream && res.headersSent) {
      writeEvent(res, 'error', payload)
      res.end()
      return
    }
    sendJson(res, requestErrorStatus(error), payload)
  }
}

export async function handleCompanyChatHealthRequest(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET')
    return
  }

  try {
    sendJson(res, 200, await getCompanyChatHealth())
  } catch (error) {
    sendJson(res, 500, getCompanyChatHealthFallback(error))
  }
}

export async function handleCompanyChatWarmupRequest(req, res, options = {}) {
  if (options.localOnly && process.env.NODE_ENV === 'production') {
    sendJson(res, 404, {
      error: 'Local model warmup is only available in local development.',
    })
    return
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST')
    return
  }

  const controller = createRequestAbortController(req, res)
  try {
    sendJson(res, 200, await warmupCompanyChat({
      signal: controller.signal,
    }))
  } catch (error) {
    if (controller.signal.aborted || res.destroyed) return
    sendJson(
      res,
      requestErrorStatus(error),
      requestErrorPayload(error, 'Local model warmup failed.'),
    )
  }
}

export async function handleCompanyChatRoute(req, res) {
  if (!req.url?.startsWith('/api/company-chat')) return false

  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname === '/api/company-chat/health') {
    await handleCompanyChatHealthRequest(req, res)
  } else if (pathname === '/api/company-chat/warmup') {
    await handleCompanyChatWarmupRequest(req, res)
  } else if (pathname === '/api/company-chat') {
    await handleCompanyChatRequest(req, res)
  } else {
    sendJson(res, 404, { error: 'Company chat route not found.' })
  }
  return true
}
