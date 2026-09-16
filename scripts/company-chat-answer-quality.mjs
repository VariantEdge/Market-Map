function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length
}

function startsWithDirectAnswer(answer) {
  return /^\s*(?:#{1,6}\s*)?(?:\*\*)?direct answer\b/i.test(answer)
}

function isOnlyGenericBulletList(answer) {
  const lines = String(answer || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const bulletLines = lines.filter((line) => /^(?:[-*•]|\d+[.)])\s+/.test(line))
  const substantiveProseLines = lines.filter((line) => (
    !/^(?:[-*•]|\d+[.)])\s+/.test(line) &&
    !/^#{1,6}\s*/.test(line) &&
    !/^confidence\s*:/i.test(line) &&
    wordCount(line) >= 20
  ))

  return bulletLines.length >= 3 && substantiveProseLines.length === 0
}

function hasWebSourceCards(payload) {
  return Array.isArray(payload?.sources) && payload.sources.some((source) => (
    source?.url &&
    source?.source_quality &&
    source.source_quality !== 'local_context'
  ))
}

function explainsFirstOrderImpact(answer) {
  return (
    /\bfirst[- ]order\b/i.test(answer) ||
    /\b(?:immediate|direct)\s+(?:operating\s+)?(?:impact|consequence|effect)\b[\s\S]{0,350}\b(?:revenue|shipments?|margins?|costs?)\b/i.test(answer)
  )
}

function explainsSecondOrderImpact(answer) {
  return (
    /\bsecond[- ]order\b/i.test(answer) ||
    /\bsecondly\b[\s\S]{0,650}\b(?:competitive position|capital intensity|market expectations|valuation|investor perception|investor sentiment)\b/i.test(answer)
  )
}

export function evaluateAnswerQuality(answer, payload = {}, rules = {}) {
  const text = String(answer || '')
  const failures = []
  const minimumWords = Number(rules.min_words || 0)

  if (minimumWords && wordCount(text) < minimumWords) {
    failures.push(`answer is under ${minimumWords} words`)
  }
  if (rules.reject_generic_bullet_list && isOnlyGenericBulletList(text)) {
    failures.push('answer is only a generic bullet list')
  }
  if (rules.reject_raw_context_ids && /\[(?:C\s*)?\d+\]/i.test(text)) {
    failures.push('answer includes a raw context ID')
  }
  if (rules.reject_direct_answer_start && startsWithDirectAnswer(text)) {
    failures.push('answer starts with "Direct answer"')
  }
  if (
    rules.reject_market_maps_evidence_heading &&
    /Evidence from Market Maps context/i.test(text)
  ) {
    failures.push('answer exposes the Market Maps context heading')
  }
  if (rules.require_first_order && !explainsFirstOrderImpact(text)) {
    failures.push('answer does not explain first-order impact')
  }
  if (rules.require_second_order && !explainsSecondOrderImpact(text)) {
    failures.push('answer does not explain second-order impact')
  }

  if (rules.require_financial_transmission) {
    const channels = [
      ['revenue', /\brevenue\b/i],
      ['margins', /\bmargins?\b/i],
      ['estimates', /\b(?:estimates?|consensus|guidance|forecast)\b/i],
      ['multiple', /\b(?:valuation\s+multiple|multiple|valuation)\b/i],
      ['investor perception', /\b(?:investor perception|investor sentiment|market perception)\b/i],
    ]
    for (const [label, pattern] of channels) {
      if (!pattern.test(text)) {
        failures.push(`answer does not explain what would show up in ${label}`)
      }
    }
  }

  if (
    rules.require_web_source_cards_when_available &&
    payload?.web_search_available === true &&
    !hasWebSourceCards(payload)
  ) {
    failures.push('answer has no clickable web source cards')
  }

  return {
    passed: failures.length === 0,
    failures,
    wordCount: wordCount(text),
    genericBulletList: isOnlyGenericBulletList(text),
    webSourceCards: hasWebSourceCards(payload),
  }
}
