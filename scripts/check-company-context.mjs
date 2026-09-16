import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPANY_CHAT_CONFIGS } from '../src/companyChatConfig.js'
import { MARKET_MAPS } from '../src/data.js'
import {
  COMPANY_CONTEXT_HEADINGS,
  THEME_CONTEXT_HEADINGS,
  validateContextMarkdown,
} from '../server/retrieval/contextSchema.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const errors = []
const warnings = []

async function checkFile(relativePath, requiredHeadings) {
  const absolutePath = join(ROOT, relativePath)
  if (!existsSync(absolutePath)) {
    errors.push(`${relativePath}: file is missing`)
    return
  }

  const markdown = await readFile(absolutePath, 'utf8')
  if (!markdown.trim()) {
    errors.push(`${relativePath}: file is empty`)
    return
  }

  const result = validateContextMarkdown(markdown, requiredHeadings)
  for (const heading of result.missingHeadings) {
    errors.push(`${relativePath}: missing heading "${heading}"`)
  }
  for (const heading of result.duplicateHeadings) {
    errors.push(`${relativePath}: duplicate heading "${heading}"`)
  }
  for (const heading of result.emptySections) {
    errors.push(`${relativePath}: empty section "${heading}"`)
  }
  for (const heading of result.placeholderSections) {
    warnings.push(`${relativePath}: placeholder flagged in "${heading}"`)
  }
}

const visibleTickers = new Set(
  Object.values(MARKET_MAPS).flatMap((marketMap) =>
    marketMap.layers.flatMap((layer) => layer.companies.map((company) => company.ticker)),
  ),
)

for (const config of Object.values(COMPANY_CHAT_CONFIGS)) {
  if (!visibleTickers.has(config.ticker)) {
    errors.push(`${config.ticker}: configured for chat but not found in Market Maps app data`)
  }
  await checkFile(
    `data/company-context/${config.ticker}.md`,
    COMPANY_CONTEXT_HEADINGS,
  )
}

const themes = new Set(
  Object.values(COMPANY_CHAT_CONFIGS).map((config) => config.theme),
)
for (const theme of themes) {
  await checkFile(
    `data/company-context/shared/${theme}.md`,
    THEME_CONTEXT_HEADINGS,
  )
}

for (const warning of warnings) console.warn(`WARN ${warning}`)
for (const error of errors) console.error(`ERROR ${error}`)

if (errors.length) {
  console.error(`Context check failed with ${errors.length} error(s) and ${warnings.length} warning(s).`)
  process.exitCode = 1
} else {
  console.log(
    `Context check passed for ${Object.keys(COMPANY_CHAT_CONFIGS).length} chat ticker(s) and ${themes.size} theme file(s) with ${warnings.length} warning(s).`,
  )
}
