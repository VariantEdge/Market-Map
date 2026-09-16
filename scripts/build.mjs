import { build } from 'vite'
import configExport from '../vite.config.js'

const mode = process.env.MODE || 'production'
const configEnv = {
  command: 'build',
  mode,
  isSsrBuild: false,
  isPreview: false,
}
const userConfig = typeof configExport === 'function'
  ? await configExport(configEnv)
  : configExport

await build({
  ...userConfig,
  configFile: false,
  root: process.cwd(),
  cacheDir: '.cache/vite',
  build: {
    ...(userConfig.build || {}),
    outDir: 'dist',
  },
})
