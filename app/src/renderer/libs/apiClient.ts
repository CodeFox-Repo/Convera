import { hc } from 'hono/client'

const client = hc('http://localhost:38000')

export default client
