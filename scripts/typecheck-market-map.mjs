import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const files = [
  ['src/App.jsx', 'jsx'],
  ['src/main.jsx', 'jsx'],
  ['src/components/CompanyChatCard.jsx', 'jsx'],
  ['src/data.js', 'js'],
  ['src/companyChatConfig.js', 'js'],
  ['api/marketData.js', 'js'],
  ['api/earningsCommentaryCore.js', 'js'],
  ['server/companyChat.ts', 'ts'],
  ['server/http/companyChatHandlers.ts', 'ts'],
  ['server/retrieval/companyContext.ts', 'ts'],
  ['server/retrieval/webContext.ts', 'ts'],
  ['server/search/index.ts', 'ts'],
  ['server/search/searxng.ts', 'ts'],
  ['server/web/fetchPage.ts', 'ts'],
]

for (const [file, loader] of files) {
  const source = await readFile(file, 'utf8')
  await transform(source, {
    loader,
    jsx: 'automatic',
    format: 'esm',
    target: 'es2022',
    sourcefile: file,
  })
}

console.log(`Market Map typecheck passed for ${files.length} modules.`)
