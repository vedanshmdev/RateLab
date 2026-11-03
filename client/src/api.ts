export type AlgorithmType =
  | 'TOKEN_BUCKET'
  | 'LEAKY_BUCKET'
  | 'FIXED_WINDOW_COUNTER'
  | 'SLIDING_WINDOW_LOG'
  | 'SLIDING_WINDOW_COUNTER'

export type AlgorithmConfig = {
  maximumRequests?: number
  windowSeconds?: number
  capacity?: number
  refillTokens?: number
  refillPeriodSeconds?: number
  leakRatePerSecond?: number
}

export type EvaluateRequest = {
  clientId: string
  algorithm: AlgorithmType
  config: AlgorithmConfig
}

export type RateLimitDecision = {
  algorithm: AlgorithmType
  allowed: boolean
  remaining: number
  retryAfterMillis: number
}

export type HealthResponse = {
  status: string
  message: string
}

export class ApiError extends Error {
  readonly status?: number

  constructor(
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const algorithmTypes: AlgorithmType[] = [
  'TOKEN_BUCKET',
  'LEAKY_BUCKET',
  'FIXED_WINDOW_COUNTER',
  'SLIDING_WINDOW_LOG',
  'SLIDING_WINDOW_COUNTER',
]

function isAlgorithmType(value: unknown): value is AlgorithmType {
  return typeof value === 'string' && algorithmTypes.some((algorithm) => algorithm === value)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMessage: string,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController()
  const externalSignal = init.signal
  const abortFromExternal = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true })
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw error
      throw new ApiError(timeoutMessage)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError(`The API returned an invalid or empty JSON response (HTTP ${response.status}).`, response.status)
  }
}

function isDecision(value: unknown, algorithm: AlgorithmType): value is RateLimitDecision {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  return (
    isAlgorithmType(result.algorithm) &&
    result.algorithm === algorithm &&
    typeof result.allowed === 'boolean' &&
    typeof result.remaining === 'number' &&
    Number.isFinite(result.remaining) &&
    typeof result.retryAfterMillis === 'number' &&
    Number.isFinite(result.retryAfterMillis)
  )
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const error = (value as Record<string, unknown>).error
  return typeof error === 'string' ? error : undefined
}

export async function checkHealth(signal?: AbortSignal, timeoutMs = 10_000): Promise<HealthResponse> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${apiBaseUrl}/api/health`,
      { signal },
      'The backend health check timed out.',
      timeoutMs,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    if (error instanceof ApiError) throw error
    throw new ApiError('Cannot reach the backend. Check that the Spring Boot API is running.')
  }

  if (!response.ok) {
    throw new ApiError(`Health check failed (HTTP ${response.status}).`, response.status)
  }
  const body = await readJson(response)
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).status !== 'string' ||
    typeof (body as Record<string, unknown>).message !== 'string'
  ) {
    throw new ApiError('The API health response did not match the expected format.', response.status)
  }
  const health = body as HealthResponse
  if (health.status !== 'UP') {
    throw new ApiError(`The backend is not ready yet: ${health.message}`, response.status)
  }
  return health
}

export async function evaluateRequest(request: EvaluateRequest): Promise<RateLimitDecision> {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${apiBaseUrl}/api/rate-limits/evaluate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
      'The request timed out. It was not recorded as a confirmed decision.',
    )
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Could not reach the backend. This attempt was not recorded as a decision.')
  }

  let body: unknown
  try {
    body = await readJson(response)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The request timed out. It was not recorded as a confirmed decision.', response.status)
    }
    throw error
  }
  if (response.status === 429 && isDecision(body, request.algorithm)) return body
  if (!response.ok) {
    throw new ApiError(
      errorMessage(body) ?? `Request failed (HTTP ${response.status}).`,
      response.status,
    )
  }
  if (!isDecision(body, request.algorithm)) {
    throw new ApiError('The API decision response did not match the expected format.', response.status)
  }
  return body
}
