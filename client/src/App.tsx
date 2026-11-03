import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  evaluateRequest,
  type AlgorithmConfig,
  type AlgorithmType,
  type RateLimitDecision,
} from './api'
import { algorithms, defaultsFor, type AlgorithmDefinition } from './algorithms'
import { useBackendConnection, type ConnectionStatus } from './useBackendConnection'
import './App.css'

type BackendStatus = 'checking' | 'available' | 'unavailable'
type GuidedDemoMode = 'fill' | 'test'

type GuidedDemoProgress = {
  mode: GuidedDemoMode
  requested: number
  completed: number
  status: 'running' | 'complete' | 'limited' | 'error'
  message: string
}

type RequestNotice =
  | {
      kind: 'allowed'
      requestNumber: number
      algorithm: AlgorithmDefinition['id']
      message: string
    }
  | {
      kind: 'limited'
      requestNumber: number
      algorithm: AlgorithmDefinition['id']
      message: string
    }
  | {
      kind: 'error'
      requestNumber: number
      algorithm: AlgorithmDefinition['id']
      message: string
      status?: number
    }

type Attempt =
  | {
      number: number
      algorithm: AlgorithmDefinition['id']
      clientId: string
      policyKey: string
      timestamp: number
      kind: 'decision'
      decision: RateLimitDecision
    }
  | {
      number: number
      algorithm: AlgorithmDefinition['id']
      clientId: string
      policyKey: string
      timestamp: number
      kind: 'error'
      message: string
      status?: number
    }

type BucketSnapshot = {
    clientId: string
    policyKey: string
    timestamp: number
    remaining: number
}

const MAX_GUIDED_REQUESTS = 20
const MAX_BUCKET_MARKS = 12
const NOTICE_DURATION_MS = 9_000

function generateClientId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createClientId(): string {
    try {
      const existing = sessionStorage.getItem('ratelab-client-id')
      if (existing) return existing
      const id = generateClientId()
      sessionStorage.setItem('ratelab-client-id', id)
      return id
    } catch {
      return generateClientId()
    }
}

function createClientIds(): Record<AlgorithmType, string> {
    return {
      TOKEN_BUCKET: createClientId(),
      LEAKY_BUCKET: generateClientId(),
      FIXED_WINDOW_COUNTER: generateClientId(),
      SLIDING_WINDOW_LOG: generateClientId(),
      SLIDING_WINDOW_COUNTER: generateClientId(),
    }
}

function validateConfig(
  algorithm: AlgorithmDefinition,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of algorithm.fields) {
    const rawValue = values[field.key] ?? ''
    const value = Number(rawValue)
    if (rawValue.trim() === '' || !Number.isFinite(value) || value <= 0) {
      errors[field.key] = 'Must be greater than zero.'
    }
  }
  return errors
}

function configFor(
  algorithm: AlgorithmDefinition,
  values: Record<string, string>,
): AlgorithmConfig {
  const config: AlgorithmConfig = {}
  for (const field of algorithm.fields) {
    const value = Number(values[field.key])
    switch (field.key) {
      case 'maximumRequests': config.maximumRequests = value; break
      case 'windowSeconds': config.windowSeconds = value; break
      case 'capacity': config.capacity = value; break
      case 'refillTokens': config.refillTokens = value; break
      case 'refillPeriodSeconds': config.refillPeriodSeconds = value; break
      case 'leakRatePerSecond': config.leakRatePerSecond = value; break
    }
  }
  return config
}

function retryDescription(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`
  return `${(milliseconds / 1_000).toFixed(1)} sec`
}

function requestLabel(number: number): string {
  return `#${number.toString().padStart(3, '0')}`
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function createTimeTicks(spanSeconds: number): { position: number; label: string }[] {
  if (!Number.isFinite(spanSeconds) || spanSeconds <= 0) return []

  const roughStep = spanSeconds / 5
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const normalized = roughStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const values: number[] = []

  for (let value = 0; value < spanSeconds; value += step) {
    values.push(value)
  }
  values.push(spanSeconds)

  return values.map((value) => ({
    position: (value / spanSeconds) * 100,
    label: `${Number(value.toFixed(1))}s`,
  }))
}

function ConnectionScreen({
  status,
  elapsedMs,
  error,
  onRetry,
}: {
  status: ConnectionStatus
  elapsedMs: number
  error: string | null
  onRetry: () => void
}) {
  const failed = status === 'failed'
  const waking = status === 'waking' || elapsedMs >= 8_000
  const longWait = elapsedMs >= 30_000

  return (
    <main className="connection-screen">
      <header className="connection-topbar">
        <a className="brand" href="#" aria-label="RateLab home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>RateLab</span>
        </a>
        <span className={`connection-state ${failed ? 'failed' : waking ? 'waking' : 'connecting'}`} role="status" aria-live="polite">
          <i />
          {failed ? 'Connection failed' : waking ? 'Waking up' : 'Connecting'}
        </span>
      </header>

      <section className={`connection-card ${failed ? 'connection-card-failed' : ''}`} aria-labelledby="connection-title">
        <div className={`server-illustration ${failed ? 'server-stopped' : ''}`} aria-hidden="true">
          <div className="server-rack">
            <span><i /><i /><b /></span>
            <span><i /><i /><b /></span>
            <span><i /><i /><b /></span>
          </div>
          <div className="server-signal signal-one" />
          <div className="server-signal signal-two" />
          <div className="server-base" />
        </div>

        <p className="connection-eyebrow">BACKEND CONNECTION</p>
        <h1 id="connection-title">Waking up the engine</h1>
        <p className="connection-description">
          {failed
            ? 'The backend did not respond in time. You can retry without reloading the page.'
            : longWait
              ? 'The backend is taking longer than usual. Render may need 30–60 seconds to wake after inactivity; we’ll keep checking.'
              : 'The backend may be asleep after a period of inactivity. We’re checking its health and will open the playground as soon as it responds.'}
        </p>

        {!failed ? (
          <>
            <div className="indeterminate-progress" role="progressbar" aria-label="Waiting for backend connection">
              <span />
            </div>
            <p className="connection-detail">
              {error
                ? 'The last check did not connect. Retrying automatically.'
                : 'This can take a little while on the first request.'}
            </p>
          </>
        ) : (
          <>
            {error && <p className="connection-error-detail">{error}</p>}
            <button className="connection-retry" type="button" onClick={onRetry}>Retry connection</button>
          </>
        )}
      </section>
      <p className="connection-footer">RateLab · Five algorithms, one request at a time</p>
    </main>
  )
}

function App() {
  const connection = useBackendConnection()
  const [selectedId, setSelectedId] = useState(algorithms[0].id)
  const [values, setValues] = useState<Record<string, string>>(() => defaultsFor(algorithms[0]))
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [busy, setBusy] = useState(false)
  const [pendingRequestNumber, setPendingRequestNumber] = useState<number | null>(null)
  const [notice, setNotice] = useState<RequestNotice | null>(null)
  const [demoProgress, setDemoProgress] = useState<GuidedDemoProgress | null>(null)
  const [clientIds, setClientIds] = useState(createClientIds)
  const [bucketSnapshots, setBucketSnapshots] = useState<Partial<Record<AlgorithmType, BucketSnapshot>>>({})
  const [animationTime, setAnimationTime] = useState(0)
  const nextRequestNumber = useRef(1)
  const backendStatus: BackendStatus = connection.status === 'connected'
    ? 'available'
    : connection.status === 'unavailable' || connection.status === 'failed'
      ? 'unavailable'
      : 'checking'

  const selected = algorithms.find((item) => item.id === selectedId) ?? algorithms[0]
  const clientId = clientIds[selected.id]
  const errors = validateConfig(selected, values)
  const isValid = Object.keys(errors).length === 0
  const config = useMemo(() => configFor(selected, values), [selected, values])
  const policyKey = JSON.stringify(config)
  const configuredLimit = selected.id === 'TOKEN_BUCKET' || selected.id === 'LEAKY_BUCKET'
    ? config.capacity
    : config.maximumRequests
  const hasGuidedLimit = configuredLimit !== undefined
    && Number.isInteger(configuredLimit)
    && configuredLimit > 0
  const guidedLimit = hasGuidedLimit ? configuredLimit : 0
  const fillFitsLimit = guidedLimit <= MAX_GUIDED_REQUESTS
  const testFitsLimit = guidedLimit + 1 <= MAX_GUIDED_REQUESTS
  const selectedAttempts = attempts.filter((attempt) => attempt.algorithm === selected.id)
  const policyAttempts = selectedAttempts.filter(
    (attempt) => attempt.clientId === clientId && attempt.policyKey === policyKey,
  )
  const policyDecisions = policyAttempts.filter(
    (attempt): attempt is Extract<Attempt, { kind: 'decision' }> => attempt.kind === 'decision',
  )
  const latestAttempt = selectedAttempts[0]
  const allowedCount = selectedAttempts.filter(
    (attempt) => attempt.kind === 'decision' && attempt.decision.allowed,
  ).length
  const limitedCount = selectedAttempts.filter(
    (attempt) => attempt.kind === 'decision' && !attempt.decision.allowed,
  ).length
  const errorCount = selectedAttempts.filter((attempt) => attempt.kind === 'error').length
  const bucketSnapshot = bucketSnapshots[selected.id]
  const currentBucketSnapshot = bucketSnapshot?.clientId === clientId && bucketSnapshot.policyKey === policyKey
    ? bucketSnapshot
    : undefined
  const elapsedSinceBucketDecision = currentBucketSnapshot
    ? Math.max(0, animationTime - currentBucketSnapshot.timestamp) / 1_000
    : 0
  const tokenIntervalSeconds = config.refillTokens && config.refillPeriodSeconds
    ? config.refillPeriodSeconds / config.refillTokens
    : 0
  const estimatedTokens = currentBucketSnapshot && config.capacity !== undefined && tokenIntervalSeconds > 0
    ? bounded(currentBucketSnapshot.remaining + elapsedSinceBucketDecision / tokenIntervalSeconds, 0, config.capacity)
    : 0
  const estimatedLeakyWork = currentBucketSnapshot && config.capacity !== undefined
    ? bounded(
      config.capacity - currentBucketSnapshot.remaining - elapsedSinceBucketDecision * (config.leakRatePerSecond ?? 0),
      0,
      config.capacity,
    )
    : 0
  const bucketCapacity = config.capacity ?? 0
  const bucketGroupSize = Math.max(1, Math.ceil(bucketCapacity / MAX_BUCKET_MARKS))
  const bucketMarkCount = Math.min(MAX_BUCKET_MARKS, Math.ceil(bucketCapacity))
  const tokenRefillProgress = tokenIntervalSeconds > 0
    ? (elapsedSinceBucketDecision % tokenIntervalSeconds) / tokenIntervalSeconds
    : 0
  const leakyDrainProgress = config.leakRatePerSecond
    ? (elapsedSinceBucketDecision * config.leakRatePerSecond) % 1
    : 0
  const windowMillis = (config.windowSeconds ?? 0) * 1_000
  const currentWindowStart = windowMillis > 0 ? Math.floor(animationTime / windowMillis) * windowMillis : animationTime
  const currentWindowElapsed = windowMillis > 0 ? animationTime - currentWindowStart : 0
  const fixedWindowEvents = policyDecisions.filter(
    (attempt) => attempt.decision.allowed && attempt.timestamp >= currentWindowStart,
  )
  const fixedTimelineStart = currentWindowStart - windowMillis
  const fixedTimelineAttempts = policyAttempts.filter(
    (attempt) => attempt.kind === 'decision'
      && attempt.timestamp >= fixedTimelineStart
      && attempt.timestamp <= currentWindowStart + windowMillis,
  )
  const slidingWindowEvents = policyDecisions.filter(
    (attempt) => attempt.decision.allowed && attempt.timestamp > animationTime - windowMillis,
  )
  const slidingTimelineAttempts = policyAttempts.filter(
    (attempt) => attempt.kind === 'decision'
      && attempt.timestamp >= fixedTimelineStart
      && attempt.timestamp <= currentWindowStart + windowMillis,
  )
  const slidingWindowLeftPercent = windowMillis > 0
    ? (currentWindowElapsed / windowMillis) * 50
    : 0
  const currentWindowWeight = windowMillis > 0
    ? (windowMillis - currentWindowElapsed) / windowMillis
    : 0
  const previousWindowPercent = Math.round(currentWindowWeight * 100)
  const currentWeightedWindowPercent = 100 - previousWindowPercent
  const previousWindowStartAgo = (windowMillis + currentWindowElapsed) / 1_000
  const previousWindowEndAgo = currentWindowElapsed / 1_000
  const currentWindowStartAgo = currentWindowElapsed / 1_000
  const previousWindowEvents = policyDecisions.filter(
    (attempt) => attempt.decision.allowed
      && attempt.timestamp >= currentWindowStart - windowMillis
      && attempt.timestamp < currentWindowStart,
  )
  const weightedPreviousCount = windowMillis > 0
    ? previousWindowEvents.length * (1 - currentWindowElapsed / windowMillis)
    : 0
  const estimatedSlidingCount = weightedPreviousCount + fixedWindowEvents.length
  const roundedSlidingCount = Math.ceil(estimatedSlidingCount)
  const timelineTicks = createTimeTicks((windowMillis * 2) / 1_000)
  const isWindowAlgorithm = selected.id === 'FIXED_WINDOW_COUNTER'
    || selected.id === 'SLIDING_WINDOW_LOG'
    || selected.id === 'SLIDING_WINDOW_COUNTER'

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const timer = window.setInterval(() => setAnimationTime(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  function selectAlgorithm(algorithm: AlgorithmDefinition) {
    setSelectedId(algorithm.id)
    setValues(defaultsFor(algorithm))
    setNotice(null)
    setDemoProgress(null)
  }

  function clearCurrentView() {
    setAttempts((current) => current.filter((attempt) => attempt.algorithm !== selected.id))
    setNotice(null)
    setDemoProgress(null)
  }

  async function sendRequest() {
    if (!isValid || busy) return
    setDemoProgress(null)
    const requestNumber = nextRequestNumber.current
    nextRequestNumber.current += 1
    setBusy(true)
    setPendingRequestNumber(requestNumber)
    setNotice(null)
    const requestAlgorithm = selected
    const requestClientId = clientId
    const requestPolicyKey = policyKey
    try {
      const decision = await evaluateRequest({
        clientId: requestClientId,
        algorithm: requestAlgorithm.id,
        config,
      })
      const timestamp = Date.now()
      setAttempts((current) => [
        {
          number: requestNumber,
          algorithm: requestAlgorithm.id,
          clientId: requestClientId,
          policyKey: requestPolicyKey,
          timestamp,
          kind: 'decision',
          decision,
        },
        ...current,
      ])
      if (requestAlgorithm.id === 'TOKEN_BUCKET' || requestAlgorithm.id === 'LEAKY_BUCKET') {
        setBucketSnapshots((current) => ({
          ...current,
          [requestAlgorithm.id]: {
            clientId: requestClientId,
            policyKey: requestPolicyKey,
            timestamp,
            remaining: decision.remaining,
          },
        }))
      }
      if (decision.allowed) {
        setNotice({
          kind: 'allowed',
          requestNumber,
          algorithm: requestAlgorithm.id,
          message: `Allowed by ${requestAlgorithm.name}. ${decision.remaining} remaining.`,
        })
      } else {
        setNotice({
          kind: 'limited',
          requestNumber,
          algorithm: requestAlgorithm.id,
          message: `Rate limit reached. Try again in ${retryDescription(decision.retryAfterMillis)}.`,
        })
      }
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'The request failed.'
      const status = reason instanceof ApiError ? reason.status : undefined
      setAttempts((current) => [
        {
          number: requestNumber,
          algorithm: requestAlgorithm.id,
          clientId: requestClientId,
          policyKey: requestPolicyKey,
          timestamp: Date.now(),
          kind: 'error',
          message,
          status,
        },
        ...current,
      ])
      setNotice({
        kind: 'error',
        requestNumber,
        algorithm: requestAlgorithm.id,
        message,
        status,
      })
    } finally {
      setBusy(false)
      setPendingRequestNumber(null)
    }
  }

  async function runGuidedDemo(mode: GuidedDemoMode) {
    if (!isValid || !hasGuidedLimit || busy) return
    const requested = guidedLimit + (mode === 'test' ? 1 : 0)
    if (requested > MAX_GUIDED_REQUESTS) return

    const runClientId = generateClientId()
    setClientIds((current) => ({ ...current, [selected.id]: runClientId }))
    setAttempts((current) => current.filter((attempt) => attempt.algorithm !== selected.id))
    setBucketSnapshots((current) => ({ ...current, [selected.id]: undefined }))
    setNotice(null)
    setBusy(true)
    setDemoProgress({
      mode,
      requested,
      completed: 0,
      status: 'running',
      message: `Sending ${requested} real requests sequentially with a fresh client identity.`,
    })

    try {
      for (let index = 0; index < requested; index += 1) {
        const requestNumber = nextRequestNumber.current
        nextRequestNumber.current += 1
        setPendingRequestNumber(requestNumber)

        try {
          const decision = await evaluateRequest({
            clientId: runClientId,
            algorithm: selected.id,
            config,
          })
          const completed = index + 1
          const timestamp = Date.now()
          setAttempts((current) => [
            {
              number: requestNumber,
              algorithm: selected.id,
              clientId: runClientId,
              policyKey,
              timestamp,
              kind: 'decision',
              decision,
            },
            ...current,
          ])
          if (selected.id === 'TOKEN_BUCKET' || selected.id === 'LEAKY_BUCKET') {
            setBucketSnapshots((current) => ({
              ...current,
              [selected.id]: {
                clientId: runClientId,
                policyKey,
                timestamp,
                remaining: decision.remaining,
              },
            }))
          }

          if (!decision.allowed) {
            const message = `The backend limited request ${completed} of ${requested}; the run stopped here.`
            setDemoProgress({ mode, requested, completed, status: 'limited', message })
            setNotice({
              kind: 'limited',
              requestNumber,
              algorithm: selected.id,
              message: `Rate limit reached. Try again in ${retryDescription(decision.retryAfterMillis)}.`,
            })
            break
          }

          if (completed === requested) {
            const message = mode === 'test'
              ? `All ${requested} requests were allowed; this run did not observe a limit response.`
              : `All ${completed} configured allowance requests were allowed.`
            setDemoProgress({ mode, requested, completed, status: 'complete', message })
            setNotice({
              kind: 'allowed',
              requestNumber,
              algorithm: selected.id,
              message: `${message} The backend's decisions are shown below.`,
            })
          } else {
            setDemoProgress({
              mode,
              requested,
              completed,
              status: 'running',
              message: `Received ${completed} of ${requested} backend decisions.`,
            })
            setNotice({
              kind: 'allowed',
              requestNumber,
              algorithm: selected.id,
              message: `Request allowed. ${decision.remaining} remaining.`,
            })
          }
        } catch (reason: unknown) {
          const message = reason instanceof Error ? reason.message : 'The request failed.'
          const status = reason instanceof ApiError ? reason.status : undefined
          const completed = index + 1
          setAttempts((current) => [
            {
              number: requestNumber,
              algorithm: selected.id,
              clientId: runClientId,
              policyKey,
              timestamp: Date.now(),
              kind: 'error',
              message,
              status,
            },
            ...current,
          ])
          setDemoProgress({
            mode,
            requested,
            completed,
            status: 'error',
            message: `The sequence stopped after a transport or API error: ${message}`,
          })
          setNotice({
            kind: 'error',
            requestNumber,
            algorithm: selected.id,
            message,
            status,
          })
          break
        }
      }
    } finally {
      setBusy(false)
      setPendingRequestNumber(null)
    }
  }

  if (!connection.hasConnected) {
    return (
      <ConnectionScreen
        status={connection.status}
        elapsedMs={connection.elapsedMs}
        error={connection.error}
        onRetry={connection.retry}
      />
    )
  }

  return (
    <main className="app-shell">
      {notice && (
        <div
          className={`result-toast toast-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
          key={`${notice.requestNumber}-${notice.kind}`}
        >
          <span className="toast-icon" aria-hidden="true">
            {notice.kind === 'allowed' ? '✓' : notice.kind === 'limited' ? '×' : '!'}
          </span>
          <div className="toast-copy">
            <strong>
              {notice.kind === 'allowed'
                ? 'Request allowed'
                : notice.kind === 'limited'
                  ? 'Rate limit reached'
                  : 'Request failed'}
              <span>{notice.algorithm.replaceAll('_', ' ')}</span>
                  {notice.kind === 'error' && notice.status && <span>HTTP {notice.status}</span>}
            </strong>
            <p>{notice.message}</p>
          </div>
          <button
            className="toast-dismiss"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
          <span className="toast-timeout" aria-hidden="true" />
        </div>
      )}

      <header className="topbar">
        <a className="brand" href="#" aria-label="RateLab home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>RateLab</span>
        </a>
        <span className={`backend-status ${backendStatus}`}>
          <i />
          {backendStatus === 'checking' ? 'Connecting' : backendStatus === 'available' ? 'Connected' : 'Offline'}
        </span>
      </header>

      <section className="playground">
        <h1>Rate limiting playground</h1>
        <p className="subtitle">Choose an algorithm, set its limits, and send a request.</p>

        <nav className="algorithm-picker" aria-label="Rate limiting algorithms">
          {algorithms.map((algorithm) => (
            <button
              type="button"
              key={algorithm.id}
              className={selected.id === algorithm.id ? 'algorithm-option selected' : 'algorithm-option'}
              onClick={() => selectAlgorithm(algorithm)}
              disabled={busy}
              aria-pressed={selected.id === algorithm.id}
            >
              {algorithm.name}
            </button>
          ))}
        </nav>

        <section className={`algorithm-card ${isWindowAlgorithm ? 'window-algorithm-card' : ''}`} aria-labelledby="algorithm-title">
          <div className="algorithm-heading">
            <div className="algorithm-title-copy">
              <h2 id="algorithm-title">{selected.name}</h2>
              <p>{selected.description}</p>
              {selected.id === 'LEAKY_BUCKET' && (
                <p className="behavior-note">Overflow is rejected; requests are not queued.</p>
              )}
            </div>
          </div>

          <div className="field-list">
            {selected.fields.map((field) => (
              <label className="config-field" key={field.key}>
                <span className="field-heading">
                  <span>{field.label}</span>
                  <span className="field-unit">{field.unit}</span>
                </span>
                <span className="input-wrap">
                  <input
                    type="number"
                    min="0"
                    step={field.step ?? '1'}
                    value={values[field.key] ?? ''                    }
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [field.key]: event.target.value }))
                    }}
                    aria-invalid={Boolean(errors[field.key])}
                    aria-describedby={errors[field.key] ? `${field.key}-error` : undefined}
                    disabled={busy}
                  />
                  {errors[field.key] && (
                    <span className="field-error" id={`${field.key}-error`}>
                      {errors[field.key]}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {selected.id === 'TOKEN_BUCKET' && (
            <section className="bucket-model model-token" aria-label="Token Bucket activity visualization">
              <div className="bucket-model-heading">
                <strong>Token Bucket · available tokens</strong>
                <span>{currentBucketSnapshot ? 'LOCAL ESTIMATE' : 'WAITING FOR API DECISION'}</span>
              </div>
              <div
                className="live-bucket-marks token-live-marks"
                role="img"
                aria-label={currentBucketSnapshot
                  ? `Estimated ${estimatedTokens.toFixed(1)} of ${bucketCapacity} tokens; last backend decision reported ${currentBucketSnapshot.remaining} remaining`
                  : `Token state has not been confirmed yet; configured capacity is ${bucketCapacity}`}
              >
                {Array.from({ length: bucketMarkCount }, (_, index) => {
                  const groupStart = index * bucketGroupSize
                  const tokenAmount = bounded(estimatedTokens - groupStart, 0, bucketGroupSize)
                  return (
                    <span className="bucket-mark" key={index}>
                      <i style={{ height: `${currentBucketSnapshot ? (tokenAmount / bucketGroupSize) * 100 : 0}%` }} />
                    </span>
                  )
                })}
              </div>
              <div className="bucket-live-summary">
                <strong>
                  {currentBucketSnapshot
                    ? `≈ ${estimatedTokens.toFixed(1)} / ${bucketCapacity} tokens`
                    : `Up to ${bucketCapacity} tokens`}
                </strong>
                {currentBucketSnapshot && (
                  <span>Last API response: {currentBucketSnapshot.remaining} remaining</span>
                )}
              </div>
              <div className="bucket-time-track" aria-label="Estimated progress toward next token refill">
                <span style={{
                  width: `${currentBucketSnapshot
                    ? estimatedTokens >= bucketCapacity ? 100 : tokenRefillProgress * 100
                    : 0}%`,
                }} />
              </div>
              <p className="bucket-live-note">
                {currentBucketSnapshot
                  ? estimatedTokens >= bucketCapacity
                    ? 'Bucket full · refill pauses until a request spends a token.'
                    : `Approx. next token in ${Math.max(0, tokenIntervalSeconds * (1 - tokenRefillProgress)).toFixed(1)} sec`
                  : 'Send a request to show the backend-confirmed remaining count. Then the refill estimate animates.'}
                {' '}Refill: {config.refillTokens} / {config.refillPeriodSeconds} sec.
              </p>
              <p className="bucket-model-disclaimer">
                Estimated from the last API count; fractional backend tokens are not exposed.
                {bucketCapacity > MAX_BUCKET_MARKS && ` Each mark represents about ${bucketGroupSize} tokens.`}
              </p>
            </section>
          )}

          {selected.id === 'LEAKY_BUCKET' && (
            <section className="bucket-model model-leaky" aria-label="Leaky Bucket activity visualization">
              <div className="bucket-model-heading">
                <strong>Leaky Bucket · work in bucket</strong>
                <span>{currentBucketSnapshot ? 'LOCAL ESTIMATE' : 'WAITING FOR API DECISION'}</span>
              </div>
              <div className="leaky-live-layout">
                <div className="leaky-live-tank" role="img" aria-label={currentBucketSnapshot
                  ? `Estimated ${estimatedLeakyWork.toFixed(1)} of ${bucketCapacity} work units in bucket`
                  : `Bucket state not yet confirmed; capacity is ${bucketCapacity}`}
                >
                  <span style={{ height: `${currentBucketSnapshot ? (estimatedLeakyWork / bucketCapacity) * 100 : 0}%` }} />
                </div>
                <div className="leaky-live-copy">
                  <strong>
                    {currentBucketSnapshot
                      ? `≈ ${estimatedLeakyWork.toFixed(1)} / ${bucketCapacity} work`
                      : `Capacity ${bucketCapacity} · state not synced`}
                  </strong>
                  {currentBucketSnapshot && <span>Last API response: {currentBucketSnapshot.remaining} capacity remaining</span>}
                  <span>New request adds 1 work · overflow is rejected, not queued.</span>
                </div>
                <div className="leaky-drain-indicator" aria-hidden="true">
                  <i style={{ left: `${leakyDrainProgress * 75}%` }} />
                </div>
              </div>
              <p className="bucket-live-note">
                {currentBucketSnapshot
                  ? `Approx. ${estimatedLeakyWork.toFixed(1)} work remains; draining at ${config.leakRatePerSecond} / sec.`
                  : 'Send a request to show the backend-confirmed capacity remaining; accepted work then drains over time.'}
              </p>
              <p className="bucket-model-disclaimer">
                Local estimate from API remaining capacity; exact fractional bucket level is not exposed.
                {bucketCapacity > MAX_BUCKET_MARKS && ` Tank is scaled to capacity ${bucketCapacity}.`}
              </p>
            </section>
          )}

          {selected.id === 'FIXED_WINDOW_COUNTER' && (
            <section className="window-model fixed-window-model" aria-label="Fixed window activity visualization">
              <div className="bucket-model-heading">
                <strong>Current fixed window</strong>
                <span>LOCAL BROWSER EVENTS</span>
              </div>
              <div className="window-model-summary">
                <strong>{fixedWindowEvents.length} / {config.maximumRequests} allowed requests</strong>
                <span>Window resets at the next aligned boundary</span>
              </div>
              <div className="window-track fixed-timeline">
                <span className="fixed-window-region" />
                <span className="fixed-playhead" style={{ left: `${50 + (currentWindowElapsed / windowMillis) * 50}%` }} />
                {fixedTimelineAttempts.slice(0, MAX_BUCKET_MARKS).map((attempt) => (
                  <i
                    className={attempt.kind === 'decision' && attempt.decision.allowed ? 'window-event allowed' : 'window-event limited'}
                    key={attempt.number}
                    style={{ left: `${bounded((attempt.timestamp - fixedTimelineStart) / (windowMillis * 2) * 100, 1, 99)}%` }}
                    title={`${requestLabel(attempt.number)} ${attempt.kind === 'decision' && attempt.decision.allowed ? 'allowed' : 'limited'}`}
                  />
                ))}
              </div>
              <div className="timeline-labels">
                <span>Previous window</span>
                <span>Boundary</span>
                <span>Current window</span>
              </div>
              <div className="time-axis" role="img" aria-label={`Time scale from 0 to ${(windowMillis * 2) / 1_000} seconds from the left edge`}>
                {timelineTicks.map((tick) => (
                  <span className="time-tick" key={tick.position} style={{ left: `${tick.position}%` }}>
                    <i aria-hidden="true" />{tick.label}
                  </span>
                ))}
              </div>
              <p className="window-model-note">
                Fixed windows do not slide: next reset in {Math.max(0, Math.ceil((windowMillis - currentWindowElapsed) / 1_000))} sec ·
                {' '}{policyAttempts.filter((attempt) => attempt.kind === 'decision' && !attempt.decision.allowed && attempt.timestamp >= currentWindowStart).length} local limited attempts (not counted)
              </p>
              <p className="bucket-model-disclaimer">Events come from this browser only; the backend may have other clients.</p>
            </section>
          )}

          {selected.id === 'SLIDING_WINDOW_LOG' && (
            <section className="window-model sliding-log-model" aria-label="Sliding Window Log activity visualization">
              <div className="bucket-model-heading">
                <strong>Rolling request log</strong>
                <span>LOCAL BROWSER EVENTS</span>
              </div>
              <div className="window-model-summary">
                <strong>{slidingWindowEvents.length} / {config.maximumRequests} allowed in last {config.windowSeconds} sec</strong>
                <span>Old events expire as the window moves</span>
              </div>
              <div className="window-track sliding-track">
                <span
                  className="sliding-window-range"
                  style={{ left: `${slidingWindowLeftPercent}%`, width: '50%' }}
                />
                <span className="sliding-now-marker" style={{ left: `${50 + (currentWindowElapsed / windowMillis) * 50}%` }} />
                {slidingTimelineAttempts.slice(0, MAX_BUCKET_MARKS).map((attempt) => (
                  <i
                    className={`window-event ${
                      attempt.timestamp > animationTime - windowMillis
                        ? attempt.kind === 'decision' && attempt.decision.allowed ? 'allowed' : 'limited'
                        : 'expired'
                    }`}
                    key={attempt.number}
                    style={{ left: `${bounded((attempt.timestamp - fixedTimelineStart) / (windowMillis * 2) * 100, 1, 99)}%` }}
                    title={`${requestLabel(attempt.number)} ${attempt.timestamp > animationTime - windowMillis ? 'inside' : 'expired'} the local rolling window`}
                  />
                ))}
              </div>
              <div className="sliding-axis-labels">
                <span style={{ left: 0 }}>{(windowMillis + currentWindowElapsed) / 1_000}s ago</span>
                <span className="sliding-start-label" style={{ left: `${slidingWindowLeftPercent}%` }}>window begins</span>
                <span className="sliding-now-label" style={{ left: `${50 + (currentWindowElapsed / windowMillis) * 50}%` }}>now</span>
                <span className="sliding-future-label" style={{ right: 0 }}>+{Math.max(0, (windowMillis - currentWindowElapsed) / 1_000).toFixed(1)}s</span>
              </div>
              <div className="time-axis" role="img" aria-label={`Time scale from 0 to ${(windowMillis * 2) / 1_000} seconds from the left edge`}>
                {timelineTicks.map((tick) => (
                  <span className="time-tick" key={tick.position} style={{ left: `${tick.position}%` }}>
                    <i aria-hidden="true" />{tick.label}
                  </span>
                ))}
              </div>
              <p className="window-model-note">The green window shifts right with time; expired events fade left. Red marks are rejected and do not occupy log slots.</p>
              <p className="bucket-model-disclaimer">Only this browser’s confirmed decisions are shown, not the backend’s full shared log.</p>
            </section>
          )}

          {selected.id === 'SLIDING_WINDOW_COUNTER' && (
            <section className="window-model sliding-counter-model" aria-label="Sliding Window Counter activity visualization">
              <div className="bucket-model-heading">
                <strong>Weighted window estimate</strong>
                <span>LOCAL BROWSER APPROXIMATION</span>
              </div>
              <div className="counter-windows">
                <div className="counter-window previous-window">
                  <span>Previous · {previousWindowStartAgo.toFixed(1)}–{previousWindowEndAgo.toFixed(1)}s ago</span>
                  <strong>{previousWindowEvents.length} req × {(currentWindowWeight * 100).toFixed(0)}%</strong>
                  <i style={{ width: `${currentWindowWeight * 100}%` }} />
                </div>
                <span className="counter-plus">+</span>
                <div className="counter-window current-window">
                  <span>Current · {currentWindowStartAgo.toFixed(1)}s ago–now</span>
                  <strong>{fixedWindowEvents.length} req × 100%</strong>
                  <i style={{ width: `${bounded(fixedWindowEvents.length / Math.max(1, config.maximumRequests ?? 1) * 100, 0, 100)}%` }} />
                </div>
              </div>
              <p className="counter-formula" aria-live="polite">
                {previousWindowEvents.length} × {(currentWindowWeight * 100).toFixed(0)}% + {fixedWindowEvents.length}
                {' '}= {weightedPreviousCount.toFixed(1)} + {fixedWindowEvents.length}
                {' '}= {estimatedSlidingCount.toFixed(1)} → ceil = <strong>{roundedSlidingCount}</strong>
              </p>
              <div className="window-model-summary counter-estimate">
                <strong>Ceiling-rounded estimate: {roundedSlidingCount} / {config.maximumRequests} requests</strong>
                <span>Elapsed in current aligned window: {currentWindowStartAgo.toFixed(1)} / {config.windowSeconds}s</span>
              </div>
              <div className="window-track fixed-timeline counter-timeline">
                <span className="counter-previous-region" />
                <span className="current-counter-region" />
                <div
                  className="sliding-window-range counter-active-window"
                  style={{ left: `${slidingWindowLeftPercent}%`, width: '50%' }}
                  role="img"
                  aria-label={`Rolling window: previous aligned window contributes ${previousWindowPercent} percent; current aligned window contributes ${currentWeightedWindowPercent} percent`}
                >
                  <span
                    className="counter-window-slice previous-slice"
                    style={{ width: `${previousWindowPercent}%` }}
                  />
                  <span
                    className="counter-window-slice current-slice"
                    style={{ width: `${currentWeightedWindowPercent}%` }}
                  />
                  <span className="counter-window-percentages">
                    <span>Previous {previousWindowPercent}%</span>
                    <span>Current {currentWeightedWindowPercent}%</span>
                  </span>
                </div>
                {slidingTimelineAttempts.slice(0, MAX_BUCKET_MARKS).map((attempt) => (
                  <i
                    className={`window-event ${attempt.kind === 'decision' && attempt.decision.allowed ? 'allowed' : 'limited'}`}
                    key={attempt.number}
                    style={{ left: `${bounded((attempt.timestamp - fixedTimelineStart) / (windowMillis * 2) * 100, 1, 99)}%` }}
                    title={`${requestLabel(attempt.number)} ${attempt.kind === 'decision' && attempt.decision.allowed ? 'allowed' : 'limited'}`}
                  />
                ))}
                <span className="fixed-playhead" style={{ left: `${50 + (currentWindowElapsed / windowMillis) * 50}%` }} />
              </div>
              <div className="counter-timeline-caption">
                <strong>Highlighted rolling window</strong>
                <span>Slides right as time passes · the marker is now</span>
              </div>
              <div className="timeline-labels">
                <span>Previous window</span>
                <span>Boundary</span>
                <span>Current window</span>
              </div>
              <div className="time-axis" role="img" aria-label={`Time scale from 0 to ${(windowMillis * 2) / 1_000} seconds from the left edge`}>
                {timelineTicks.map((tick) => (
                  <span className="time-tick" key={tick.position} style={{ left: `${tick.position}%` }}>
                    <i aria-hidden="true" />{tick.label}
                  </span>
                ))}
              </div>
              <p className="bucket-model-disclaimer">
                Ceiling is for displaying a whole-request estimate; the backend makes its decision using the unrounded weighted count.
                This local calculation uses browser-confirmed events, not the backend’s full shared state.
              </p>
            </section>
          )}

          <div className="send-actions">
            <button
              className="send-button"
              type="button"
              onClick={() => void sendRequest()}
              disabled={!isValid || busy}
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
            <button
              className="clear-button"
              type="button"
              onClick={clearCurrentView}
              disabled={selectedAttempts.length === 0 || busy}
            >
              Clear local view
            </button>
          </div>
          <p className="pacing-note">Manual pacing: click one request at a time to watch the limit build naturally.</p>

          <section className="guided-demo" aria-labelledby="guided-demo-title">
            <div className="guided-demo-heading">
              <h3 id="guided-demo-title">Guided run</h3>
              <span>REAL SEQUENTIAL REQUESTS</span>
            </div>
            <p>
              Each run starts with a fresh client identity and sends requests one at a time. “Trigger limit” sends
              one extra request; bucket refill or drain timing can affect whether it is rejected.
            </p>
            <div className="guided-demo-actions">
              <button
                type="button"
                className="guided-button fill-button"
                onClick={() => void runGuidedDemo('fill')}
                disabled={!isValid || !hasGuidedLimit || !fillFitsLimit || busy}
              >
                Fill allowance · {guidedLimit} calls
              </button>
              <button
                type="button"
                className="guided-button test-button"
                onClick={() => void runGuidedDemo('test')}
                disabled={!isValid || !hasGuidedLimit || !testFitsLimit || busy}
              >
                Trigger limit · {guidedLimit + 1} calls
              </button>
            </div>
            {!hasGuidedLimit && (
              <p className="guided-demo-hint">Guided runs need a whole-number request limit or bucket capacity.</p>
            )}
            {hasGuidedLimit && !fillFitsLimit && (
              <p className="guided-demo-hint">
                Guided runs are capped at {MAX_GUIDED_REQUESTS} real calls. Reduce the configured limit to continue.
              </p>
            )}
            {demoProgress && (
              <div
                className={`demo-progress progress-${demoProgress.status}`}
                role="status"
                aria-live="polite"
              >
                <div className="demo-progress-copy">
                  <strong>
                    {demoProgress.mode === 'fill' ? 'Filling allowance' : 'Testing the limit'}
                  </strong>
                  <span>{demoProgress.completed} / {demoProgress.requested} calls</span>
                </div>
                <div
                  className="demo-progress-track"
                  role="progressbar"
                  aria-label="Guided run progress"
                  aria-valuemin={0}
                  aria-valuemax={demoProgress.requested}
                  aria-valuenow={demoProgress.completed}
                >
                  <span
                    style={{
                      width: `${(demoProgress.completed / demoProgress.requested) * 100}%`,
                    }}
                  />
                </div>
                <p>{demoProgress.message}</p>
              </div>
            )}
          </section>

          <section className="request-flow" aria-label="Request flow visualization">
            <div className="flow-heading">
              <h3>Individual request paths</h3>
              <span>LEFT → RIGHT · CONFIRMED OUTCOME</span>
            </div>

            <div className="flow-counts" aria-live="polite">
              <span><strong>{selectedAttempts.length}</strong> sent</span>
              <span><strong className="count-allowed">{allowedCount}</strong> allowed</span>
              <span><strong className="count-limited">{limitedCount}</strong> limited</span>
              <span><strong className="count-error">{errorCount}</strong> errors</span>
            </div>

            <div className="request-trail" role="list" aria-label="Recent individual request paths">
              {selectedAttempts.slice(0, 8).reverse().map((attempt) => (
                <div
                  className={`trail-item ${attempt.kind === 'error'
                    ? 'trail-error'
                    : attempt.decision.allowed ? 'trail-allowed' : 'trail-limited'
                  } ${attempt.number === latestAttempt?.number ? 'trail-new' : ''}`}
                  key={attempt.number}
                  role="listitem"
                  title={attempt.kind === 'error'
                    ? attempt.message
                    : attempt.decision.allowed ? 'Allowed by the backend' : 'Rate limited by the backend'}
                >
                  <span className="trail-request">{requestLabel(attempt.number)}</span>
                  <span className="trail-track" aria-hidden="true"><i /></span>
                  <span className="trail-result">
                    <span className="trail-symbol" aria-hidden="true">
                      {attempt.kind === 'error' ? '!' : attempt.decision.allowed ? '✓' : '×'}
                    </span>
                    <span>
                      <strong>{attempt.kind === 'error' ? 'API error' : attempt.decision.allowed ? 'Allowed' : 'Limited'}</strong>
                      <small>
                        {attempt.kind === 'error'
                          ? 'No confirmed decision'
                          : attempt.decision.allowed
                            ? `${attempt.decision.remaining} remaining`
                            : `Retry ${retryDescription(attempt.decision.retryAfterMillis)}`}
                      </small>
                    </span>
                  </span>
                </div>
              ))}
              {selectedAttempts.length === 0 && !busy && (
                <p className="trail-empty">Run a request to see its path and backend result.</p>
              )}
              {busy && (
                <div className="trail-item trail-pending" role="listitem">
                  <span className="trail-request">
                    {pendingRequestNumber === null ? '…' : requestLabel(pendingRequestNumber)}
                  </span>
                  <span className="trail-track" aria-hidden="true"><i /></span>
                  <span className="trail-result">
                    <span className="trail-symbol" aria-hidden="true">…</span>
                    <span><strong>In progress</strong><small>Waiting for backend</small></span>
                  </span>
                </div>
              )}
            </div>
            <p className="flow-footnote">Browser requests only · line colors reflect confirmed API results</p>
          </section>

          <section className="learning-flow" aria-labelledby="learning-title">
            <div className="learning-heading">
              <h3 id="learning-title">How {selected.name} works</h3>
              <span>THE DECISION FLOW</span>
            </div>
            <ol className="learning-steps">
              {selected.flowSteps.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </section>

        {backendStatus === 'unavailable' && (
          <div className="connection-warning" role="status">
            <span>
              <strong>Backend connection lost.</strong>
              {connection.error && <small>{connection.error}</small>}
            </span>
            <button type="button" onClick={connection.retry}>Check again</button>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
