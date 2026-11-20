import 'dotenv/config'
import { validateRuntimeConfig } from './runtimeConfig.js'

async function start() {
  const { host, port } = validateRuntimeConfig()
  const { app } = await import('./index.js')
  app.listen(port, host, () => {
    process.stderr.write(`Gestora API escuchando en ${host}:${port}\n`)
  })
}

start().catch((error) => {
  process.stderr.write(`No se pudo iniciar la API: ${error.message}\n`)
  process.exitCode = 1
})
