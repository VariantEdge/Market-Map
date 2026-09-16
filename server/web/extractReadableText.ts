const MAX_EXTRACTED_CHARACTERS = 28_000

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase()
    if (ENTITY_MAP[normalized]) return ENTITY_MAP[normalized]
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return match
  })
}

function metaContent(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) return decodeEntities(match[1].trim())
    }
  }
  return null
}

function extractTitle(html: string) {
  return (
    metaContent(html, ['og:title', 'twitter:title']) ||
    decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '') ||
    null
  )
}

function extractPublishedAt(html: string) {
  return metaContent(html, [
    'article:published_time',
    'date',
    'datePublished',
    'publish-date',
    'pubdate',
  ])
}

export function extractReadableText(html: string) {
  const withoutNoise = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|template|nav|footer|form|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const text = decodeEntities(withoutNoise)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 35)
    .filter((line) => !/^(cookie|privacy policy|terms of use|subscribe|sign in)\b/i.test(line))
    .join('\n')
    .slice(0, MAX_EXTRACTED_CHARACTERS)

  return {
    title: extractTitle(html),
    publishedAt: extractPublishedAt(html),
    text,
  }
}
