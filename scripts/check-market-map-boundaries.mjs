import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SOURCE_DIRS = ['api', 'server', 'src']
const TEXT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.css'])
const forbidden = [
  /(?:^|[\\/])podcast(?:[\\/]|$)/i,
  /(?:^|[\\/])tracefolio(?:[\\/]|$)/i,
  /(?:^|[\\/])youtube(?:[\\/]|$)/i,
  /(?:^|[\\/])x-ticker-monitor(?:[\\/]|$)/i,
  /XTickerMonitor/i,
  /(?:^|[\\/])reelrelay(?:[\\/]|$)/i,
  /Website App/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
]

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files
}

let failed = false
for (const directory of SOURCE_DIRS) {
  for (const file of await walk(join(ROOT, directory))) {
    const source = await readFile(file, 'utf8')
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        console.error(`${relative(ROOT, file)}: forbidden coupling ${pattern}`)
        failed = true
      }
    }
  }
}

if (failed) process.exit(1)
console.log('Market Map, Watchlist, and Valuation boundary check passed.')
