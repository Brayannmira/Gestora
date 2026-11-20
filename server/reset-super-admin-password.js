import 'dotenv/config'
import { StringDecoder } from 'node:string_decoder'
import { db, defaultOrganizationId } from './database.js'
import { hashPassword } from './security.js'
import { resetSuperAdminPassword } from './resetSuperAdminPassword.js'

function readHiddenInput(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Ejecuta este comando desde una terminal interactiva.')
  }

  return new Promise((resolve, reject) => {
    let value = ''
    const decoder = new StringDecoder('utf8')

    function finish(callback, result) {
      process.stdin.off('data', handleData)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stderr.write('\n')
      callback(result)
    }

    function handleData(chunk) {
      for (const character of decoder.write(chunk)) {
        if (character === '\r' || character === '\n') {
          finish(resolve, value)
          return
        }
        if (character === '\u0003') {
          finish(reject, new Error('Restablecimiento cancelado.'))
          return
        }
        if (character === '\u0008' || character === '\u007f') {
          value = Array.from(value).slice(0, -1).join('')
          continue
        }
        if (character >= ' ' && character !== '\u007f') {
          value += character
          if (value.length > 256) {
            finish(reject, new Error('La contraseña no puede superar 256 caracteres.'))
            return
          }
        }
      }
    }

    process.stderr.write(prompt)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', handleData)
  })
}

function maskEmail(email) {
  const [localPart = '', domain = ''] = email.split('@')
  return `${localPart.slice(0, 1)}***@${domain}`
}

async function main() {
  try {
    const password = await readHiddenInput(
      'Nueva contraseña (12 caracteres mínimo; entrada oculta): ',
    )
    const confirmation = await readHiddenInput(
      'Confirma la nueva contraseña (entrada oculta): ',
    )
    if (password !== confirmation) {
      throw new Error('Las contraseñas no coinciden.')
    }

    const account = await resetSuperAdminPassword({
      database: db,
      password,
      hashPassword,
      organizationId: process.env.RESET_SUPER_ADMIN_ORGANIZATION_ID || defaultOrganizationId,
      email: process.env.RESET_SUPER_ADMIN_EMAIL,
    })
    process.stderr.write(
      `Contraseña restablecida para ${maskEmail(account.email)}. Se cerraron las sesiones anteriores.\n`,
    )
  } finally {
    db.close()
  }
}

main().catch((error) => {
  process.stderr.write(`No se pudo restablecer la contraseña: ${error.message}\n`)
  process.exitCode = 1
})
