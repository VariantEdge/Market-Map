import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { extractReadableText } from './extractReadableText.ts'

const FETCH_TIMEOUT_MS = 12_000
const MAX_RESPONSE_BYTES = 2_500_000
const MAX_REDIRECTS = 3

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  )
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase()
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

async function assertSafeUrl(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported page protocol.')
  if (url.username || url.password) throw new Error('Credentialed page URLs are not allowed.')
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) {
    throw new Error('Local page URLs are not allowed.')
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await lookup(url.hostname, { all: true })
  if (addresses.some(({ address, family }) => (
    family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)
  ))) {
    throw new Error('Private-network page URLs are not allowed.')
  }
  return url
}

async function readLimitedBody(response: Response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let body = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) throw new Error('Page exceeded the fetch size limit.')
    body += decoder.decode(value, { stream: true })
  }
  return body
}

export async function fetchPage(url: string, options: {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  timeoutMs?: number
} = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  const timeout = setTimeout(
    () => controller.abort(new Error('page fetch timeout')),
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  )
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    let currentUrl = await assertSafeUrl(url)
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await fetchImpl(currentUrl, {
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'MarketMaps/1.0 local research assistant',
        },
        signal: controller.signal,
      })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Page redirect failed.')
        currentUrl = await assertSafeUrl(new URL(location, currentUrl).toString())
        continue
      }
      if (!response.ok) throw new Error(`Page fetch returned HTTP ${response.status}.`)

      const contentType = response.headers.get('content-type') || ''
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(`Unsupported page content type: ${contentType || 'unknown'}.`)
      }
      const html = await readLimitedBody(response)
      return {
        finalUrl: currentUrl.toString(),
        retrievedAt: new Date().toISOString(),
        ...extractReadableText(html),
      }
    }
    throw new Error('Page redirect limit exceeded.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
