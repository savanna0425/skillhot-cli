import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { SkillHotError, type CatalogMetadata, type DiscoveryEngine } from '@skillhot/core'

const MAX_JSON_BODY_BYTES = 64 * 1024

export interface ListenOptions {
  host?: string
  port?: number
  allowRemote?: boolean
}

interface ErrorResponse {
  error: {
    code: string
    message: string
  }
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  response.end(JSON.stringify(body))
}

function failure(response: ServerResponse, status: number, code: string, message: string, headers?: Record<string, string>): void {
  json(response, status, { error: { code, message } } satisfies ErrorResponse, headers)
}

function requestError(code: string, message: string): SkillHotError {
  return new SkillHotError(code, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function statusFor(error: unknown): number {
  if (!(error instanceof SkillHotError)) return 500
  if (error.code === 'SKILL_NOT_FOUND') return 404
  if (error.code === 'BODY_TOO_LARGE') return 413
  return 400
}

function respondToError(response: ServerResponse, error: unknown): void {
  if (error instanceof SkillHotError) {
    failure(response, statusFor(error), error.code, error.message)
    return
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  failure(response, 500, 'UNEXPECTED_ERROR', message)
}

function methodNotAllowed(response: ServerResponse, allow: string): void {
  failure(response, 405, 'METHOD_NOT_ALLOWED', `This route only accepts ${allow}.`, { allow })
}

function decodeRef(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw requestError('INVALID_ARGUMENT', 'Skill reference must be URL encoded.')
  }
}

function parseLimit(value: string | null): number | undefined {
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) throw requestError('INVALID_ARGUMENT', 'limit must be an integer from 1 to 20.')
  const limit = Number(value)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw requestError('INVALID_ARGUMENT', 'limit must be an integer from 1 to 20.')
  }
  return limit
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw requestError('INVALID_ARGUMENT', `Missing ${label}.`)
  return value
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers['content-length']
  if (contentLength !== undefined && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw requestError('BODY_TOO_LARGE', 'JSON request bodies must not exceed 64 KiB.')
  }

  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let length = 0
    let tooLarge = false

    request.on('data', (chunk: Buffer) => {
      length += chunk.length
      if (length > MAX_JSON_BODY_BYTES) {
        tooLarge = true
      } else {
        chunks.push(chunk)
      }
    })
    request.once('error', reject)
    request.once('end', () => {
      if (tooLarge) {
        reject(requestError('BODY_TOO_LARGE', 'JSON request bodies must not exceed 64 KiB.'))
        return
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        if (text.trim() === '') throw requestError('INVALID_JSON', 'Request body must contain JSON.')
        resolve(JSON.parse(text))
      } catch (error) {
        reject(error instanceof SkillHotError ? error : requestError('INVALID_JSON', 'Request body must contain valid JSON.'))
      }
    })
  })
}

function recommendations(engine: DiscoveryEngine, search: URLSearchParams) {
  const query = search.get('q')
  if (query === null || query.trim() === '') throw requestError('INVALID_ARGUMENT', 'Missing query parameter q.')
  const platformValues = search.getAll('platform').flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean)
  const status = search.get('status')
  if (status !== null && status !== 'active' && status !== 'archived') {
    throw requestError('INVALID_ARGUMENT', 'status must be active or archived.')
  }
  return engine.find({
    query,
    limit: parseLimit(search.get('limit')),
    category: search.get('category') ?? undefined,
    platforms: platformValues.length > 0 ? platformValues : undefined,
    license: search.get('license') ?? undefined,
    catalogStatus: status ?? undefined
  })
}

async function route(engine: DiscoveryEngine, metadata: CatalogMetadata, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const method = request.method ?? 'GET'
  const alternativesMatch = url.pathname.match(/^\/v1\/skills\/(.+)\/alternatives$/)
  const skillMatch = url.pathname.match(/^\/v1\/skills\/(.+)$/)

  if (url.pathname === '/health') {
    if (method !== 'GET') return methodNotAllowed(response, 'GET')
    return json(response, 200, { data: { service: 'skillhot', status: 'ok' }, meta: metadata })
  }
  if (url.pathname === '/v1/recommendations') {
    if (method !== 'GET') return methodNotAllowed(response, 'GET')
    return json(response, 200, { data: recommendations(engine, url.searchParams), meta: metadata })
  }
  if (alternativesMatch !== null) {
    if (method !== 'GET') return methodNotAllowed(response, 'GET')
    return json(response, 200, { data: engine.alternatives(decodeRef(alternativesMatch[1]), parseLimit(url.searchParams.get('limit'))), meta: metadata })
  }
  if (skillMatch !== null) {
    if (method !== 'GET') return methodNotAllowed(response, 'GET')
    return json(response, 200, { data: engine.show(decodeRef(skillMatch[1])), meta: metadata })
  }
  if (url.pathname === '/v1/compare') {
    if (method !== 'POST') return methodNotAllowed(response, 'POST')
    const body = await readJson(request)
    if (!isRecord(body) || !Array.isArray(body.refs) || !body.refs.every((ref) => typeof ref === 'string')) {
      throw requestError('INVALID_ARGUMENT', 'compare requires a JSON object with refs as an array of skill references.')
    }
    return json(response, 200, { data: engine.compare(body.refs), meta: metadata })
  }
  if (url.pathname === '/v1/agent-prompt') {
    if (method !== 'POST') return methodNotAllowed(response, 'POST')
    const body = await readJson(request)
    if (!isRecord(body)) throw requestError('INVALID_ARGUMENT', 'agent-prompt requires a JSON object.')
    const agent = body.agent === undefined ? 'generic' : requiredString(body.agent, 'agent')
    return json(response, 200, { data: engine.installPrompt({ skill: requiredString(body.skill, 'skill'), agent }), meta: metadata })
  }
  failure(response, 404, 'NOT_FOUND', 'No route matches this request.')
}

export function createServer(engine: DiscoveryEngine, metadata: CatalogMetadata): Server {
  return createHttpServer((request, response) => {
    void route(engine, metadata, request, response).catch((error: unknown) => {
      if (!response.headersSent) respondToError(response, error)
    })
  })
}

export function validateHost(host: string, allowRemote: boolean): void {
  if (!allowRemote && host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new SkillHotError('UNSAFE_HOST', 'Non-loopback binding requires explicit --allow-remote-host opt-in.')
  }
}

export async function listen(server: Server, { host = '127.0.0.1', port = 4318, allowRemote = false }: ListenOptions = {}): Promise<Server> {
  validateHost(host, allowRemote)
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(server)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}
