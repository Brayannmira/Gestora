import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const secret = process.env.SESSION_SECRET

if (
  process.env.NODE_ENV === 'production' &&
  (!secret || secret.length < 32 || secret.startsWith('replace-this-with-'))
) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción.')
}

export const sessionSecret = secret ?? randomBytes(32).toString('hex')
const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = (storedHash || dummyHash).split('$')
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false

  const expected = Buffer.from(expectedHex, 'hex')
  const actual = await scrypt(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return createHmac('sha256', sessionSecret).update(token).digest('hex')
}

export function createOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashOtp(challengeId, code) {
  return createHmac('sha256', sessionSecret)
    .update(`${challengeId}:${code}`)
    .digest('hex')
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
