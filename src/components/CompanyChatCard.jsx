import { useEffect, useRef, useState } from 'react'

const IS_LOCAL_DEV = import.meta.env.DEV

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${url} returned HTTP ${response.status}`)
  return payload
}

async function postCompanyChatStream(url, body, options = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  options.onOpen?.()

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `${url} returned HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('Company chat returned an empty response.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false

  const processBlock = (block) => {
    let eventName = 'message'
    const dataLines = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    const payload = JSON.parse(dataLines.join('\n'))
    if (eventName === 'error') throw new Error(payload.error || 'Company chat request failed.')
    if (eventName === 'done') completed = true
    options.onEvent?.(eventName, payload)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    blocks.filter(Boolean).forEach(processBlock)
  }
  if (buffer.trim()) processBlock(buffer)
  if (!completed) throw new Error('Local model response ended before completion. Retry the question.')
}

function formatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const SOURCE_QUALITY_LABELS = {
  official_company: 'Official company',
  sec: 'SEC',
  transcript: 'Transcript',
  reputable_news: 'Reputable news',
  local_context: 'Local context',
  generic_web: 'Generic web',
}

function formatSourceLabel(source) {
  const quality = SOURCE_QUALITY_LABELS[source.source_quality]
  return quality ? `${quality} · ${source.label}` : source.label
}

export default function CompanyChatCard({
  ticker,
  companyName,
  theme,
  layer,
  promptChips,
}) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [warmupLoading, setWarmupLoading] = useState(false)
  const [warmupStatus, setWarmupStatus] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setQuestion('')
    setMessages([])
    setLoading(false)
    setStage('')
    setError('')
    setWarmupStatus('')
  }, [ticker])

  useEffect(() => () => abortRef.current?.abort(), [])

  const stopQuestion = () => abortRef.current?.abort()

  const warmupLocalModel = async () => {
    if (warmupLoading || loading) return
    setWarmupLoading(true)
    setWarmupStatus('Warming up local model...')
    setError('')
    try {
      await postJson('/api/company-chat/warmup', {})
      setWarmupStatus('Local model is ready.')
    } catch (warmupError) {
      setWarmupStatus('')
      setError(warmupError.message)
    } finally {
      setWarmupLoading(false)
    }
  }

  const submitQuestion = async (questionOverride = '') => {
    const nextQuestion = String(questionOverride || question).trim()
    if (!nextQuestion || loading) return

    const controller = new AbortController()
    const assistantId = `assistant-${Date.now()}`
    const conversation = messages
      .filter((message) => !message.streaming && message.content)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }))

    abortRef.current = controller
    setLoading(true)
    setStage('Searching web and Market Maps context...')
    setError('')
    setWarmupStatus('')
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: nextQuestion },
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        sources: [],
        usedContext: [],
        costMode: 'local_ollama_plus_free_web_retrieval',
      },
    ])
    setQuestion('')

    try {
      await postCompanyChatStream(
        '/api/company-chat',
        {
          ticker,
          theme,
          layer,
          question: nextQuestion,
          conversation,
        },
        {
          signal: controller.signal,
          onOpen: () => setStage('Reading Market Maps context...'),
          onEvent: (eventName, payload) => {
            if (eventName === 'context') {
              setStage('Thinking locally with Ollama...')
              setMessages((current) => current.map((message) => (
                message.id === assistantId
                  ? {
                      ...message,
                      sources: payload.sources ?? [],
                      usedContext: payload.used_context ?? [],
                      costMode: payload.cost_mode,
                      contextQuality: payload.context_quality,
                      retrievalNotice: payload.retrieval_notice,
                      webSearchEnabled: payload.web_search_enabled,
                      webSearchAvailable: payload.web_search_available,
                    }
                  : message
              )))
            }
            if (eventName === 'token') {
              setStage('Generating answer...')
              setMessages((current) => current.map((message) => (
                message.id === assistantId
                  ? { ...message, content: `${message.content}${payload.token ?? ''}` }
                  : message
              )))
            }
            if (eventName === 'done') {
              setMessages((current) => current.map((message) => (
                message.id === assistantId
                  ? {
                      ...message,
                      streaming: false,
                      confidence: payload.confidence,
                      timestamp: payload.timestamp,
                      costMode: payload.cost_mode,
                      contextQuality: payload.context_quality,
                      retrievalNotice: payload.retrieval_notice,
                      webSearchEnabled: payload.web_search_enabled,
                      webSearchAvailable: payload.web_search_available,
                    }
                  : message
              )))
            }
          },
        },
      )
    } catch (requestError) {
      if (requestError.name === 'AbortError') {
        setMessages((current) => current
          .map((message) => (
            message.id === assistantId
              ? {
                  ...message,
                  streaming: false,
                  stopped: true,
                  timestamp: new Date().toISOString(),
                }
              : message
          ))
          .filter((message) => message.id !== assistantId || message.content))
      } else {
        setMessages((current) => current.filter((message) => message.id !== assistantId))
        setError(requestError.message)
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
      setStage('')
    }
  }

  return (
    <div className="ticker-ai-card">
      <div className="ticker-chat-heading">
        <div>
          <h3>Ask Market Maps about {ticker}</h3>
          <p>
            Grounded in local {companyName} context, Layer {layer}, and your {theme} map.
          </p>
        </div>
        <span className="ticker-chat-local">Local Ollama</span>
      </div>

      {messages.length > 0 && (
        <div className="ticker-chat-thread" aria-live="polite">
          {messages.map((message, index) => (
            <div
              className={`ticker-chat-message ticker-chat-message--${message.role}`}
              key={message.id ?? `${message.role}-${index}`}
            >
              <span>{message.role === 'user' ? 'You' : 'Market Maps'}</span>
              <div>{message.content}</div>
              {message.role === 'assistant' && message.content && (
                <>
                  <div className="ticker-chat-answer-meta">
                    {message.confidence && <span>Confidence: {message.confidence}</span>}
                    <span className="ticker-chat-cost">
                      Local model + free web search · zero API cost
                    </span>
                    {message.timestamp && (
                      <time dateTime={message.timestamp}>{formatTimestamp(message.timestamp)}</time>
                    )}
                    {message.stopped && <span>Stopped</span>}
                  </div>

                  {message.retrievalNotice && (
                    <div className="ticker-chat-retrieval-notice">
                      {message.retrievalNotice}
                    </div>
                  )}

                  {message.sources?.length > 0 && (
                    <div className="ticker-chat-evidence">
                      <div className="ticker-chat-chip-row">
                        <strong>Sources</strong>
                        {message.sources.slice(0, 8).map((source) => (
                          source.url
                            ? (
                                <a
                                  href={source.url}
                                  key={source.id}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`${SOURCE_QUALITY_LABELS[source.source_quality] || 'Source'} · ${source.source_file || source.type}`}
                                >
                                  {formatSourceLabel(source)}
                                </a>
                              )
                            : (
                                <span key={source.id} title={source.source_file || source.type}>
                                  {formatSourceLabel(source)}
                                </span>
                              )
                        ))}
                      </div>
                    </div>
                  )}

                </>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="ticker-chat-status" role="status">
          <span className="ticker-chat-status-dot" aria-hidden="true" />
          {stage}
        </div>
      )}
      {error && <div className="ticker-chat-error" role="alert">{error}</div>}

      <form
        className="ticker-chat-form"
        onSubmit={(event) => {
          event.preventDefault()
          submitQuestion()
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Ask any investor question about ${ticker}`}
          aria-label={`Ask Market Maps about ${ticker}`}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>Ask</button>
        {loading && (
          <button className="ticker-chat-cancel" type="button" onClick={stopQuestion}>
            Stop
          </button>
        )}
      </form>

      {IS_LOCAL_DEV && (
        <div className="ticker-chat-local-tools">
          <span>First local answer may take 30–60 seconds depending on your machine.</span>
          <button
            type="button"
            onClick={warmupLocalModel}
            disabled={warmupLoading || loading}
          >
            {warmupLoading ? 'Warming up...' : 'Warm up local model'}
          </button>
          {warmupStatus && <strong>{warmupStatus}</strong>}
        </div>
      )}

      <div className="ticker-prompts">
        {promptChips.map((prompt) => (
          <button
            type="button"
            key={prompt}
            onClick={() => submitQuestion(prompt)}
            disabled={loading}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
