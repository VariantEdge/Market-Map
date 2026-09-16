export const COMPANY_CONTEXT_HEADINGS = [
  'Company summary',
  'Market map layer',
  'Chokepoint',
  'Products / exposure',
  'Bull case',
  'Bear case',
  'Alternatives / competitors',
  'What would break the thesis',
  'Key debates',
  'Key open questions',
  'Source notes',
]

export const THEME_CONTEXT_HEADINGS = [
  'Theme overview',
  'Layer definitions',
  'Value chain',
  'Bottlenecks',
  'Relevant companies',
  'Key debates',
  'Source notes',
]

export const PLACEHOLDER_PATTERN =
  /\b(?:placeholder|todo|tbd|to be added|not yet added|has been added yet|no additional verified|add verified|needs verified)\b/i

export function normalizeHeading(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function parseMarkdownSections(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const sections = []
  let current = null

  const flush = () => {
    if (!current) return
    current.content = current.lines.join('\n').trim()
    delete current.lines
    sections.push(current)
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (headingMatch) {
      flush()
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        lines: [],
      }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()
  return sections
}

export function validateContextMarkdown(markdown, requiredHeadings) {
  const sections = parseMarkdownSections(markdown)
  const headingCounts = new Map()

  for (const section of sections) {
    const normalized = normalizeHeading(section.heading)
    headingCounts.set(normalized, (headingCounts.get(normalized) ?? 0) + 1)
  }

  const missingHeadings = requiredHeadings.filter(
    (heading) => !headingCounts.has(normalizeHeading(heading)),
  )
  const duplicateHeadings = [...headingCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([heading]) => heading)
  const placeholderSections = sections
    .filter((section) => PLACEHOLDER_PATTERN.test(section.content))
    .map((section) => section.heading)
  const emptySections = sections
    .filter((section) => !section.content)
    .map((section) => section.heading)

  return {
    sections,
    missingHeadings,
    duplicateHeadings,
    placeholderSections,
    emptySections,
  }
}
