const REALM = 'Market Maps'
const DEFAULT_USERNAME = 'dale'

export default function middleware(request) {
  if (process.env.VERCEL_ENV !== 'production') return

  const password = process.env.SITE_PASSWORD
  if (!password) {
    return new Response('Production password is not configured.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const username = process.env.SITE_USERNAME || DEFAULT_USERNAME
  const authorization = request.headers.get('authorization')

  if (isValidBasicAuth(authorization, username, password)) return

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  })
}

function isValidBasicAuth(authorization, username, password) {
  if (!authorization?.startsWith('Basic ')) return false

  try {
    const credentials = atob(authorization.slice('Basic '.length))
    const separatorIndex = credentials.indexOf(':')
    if (separatorIndex === -1) return false
    return credentials.slice(0, separatorIndex) === username
      && credentials.slice(separatorIndex + 1) === password
  } catch {
    return false
  }
}
