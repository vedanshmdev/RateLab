import { useCallback, useEffect, useRef, useState } from 'react'
import { checkHealth } from './api'

const INITIAL_CONNECTION_TIMEOUT_MS = 120_000
const INITIAL_REQUEST_TIMEOUT_MS = 20_000
const RETRY_DELAY_MS = 5_000
const MONITOR_INTERVAL_MS = 60_000

export type ConnectionStatus = 'connecting' | 'waking' | 'connected' | 'failed' | 'unavailable' | 'checking'

type BackendConnection = {
  status: ConnectionStatus
  hasConnected: boolean
  elapsedMs: number
  error: string | null
  retry: () => void
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'The backend health check failed.'
}

export function useBackendConnection(): BackendConnection {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [hasConnected, setHasConnected] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [monitorVersion, setMonitorVersion] = useState(0)
  const connectedRef = useRef(false)

  useEffect(() => {
    connectedRef.current = hasConnected
  }, [hasConnected])

  useEffect(() => {
    if (hasConnected) return

    let active = true
    let requestController: AbortController | null = null
    let retryTimer: number | null = null
    const startedAt = Date.now()

    const clock = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setElapsedMs(elapsed)
      if (elapsed >= INITIAL_CONNECTION_TIMEOUT_MS) {
        active = false
        window.clearInterval(clock)
        requestController?.abort()
        if (retryTimer !== null) window.clearTimeout(retryTimer)
        setStatus('failed')
      } else if (elapsed >= 8_000) {
        setStatus('waking')
      }
    }, 1_000)

    const runHealthCheck = async (): Promise<void> => {
      if (!active) return
      const remainingMs = INITIAL_CONNECTION_TIMEOUT_MS - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        active = false
        setStatus('failed')
        return
      }

      requestController = new AbortController()
      try {
        await checkHealth(requestController.signal, Math.min(INITIAL_REQUEST_TIMEOUT_MS, remainingMs))
        if (!active) return
        connectedRef.current = true
        setError(null)
        setStatus('connected')
        setHasConnected(true)
      } catch (reason: unknown) {
        if (!active || (reason instanceof Error && reason.name === 'AbortError')) return
        setError(getErrorMessage(reason))
        setStatus('waking')
        const delay = Math.min(RETRY_DELAY_MS, INITIAL_CONNECTION_TIMEOUT_MS - (Date.now() - startedAt))
        if (delay > 0) retryTimer = window.setTimeout(() => void runHealthCheck(), delay)
      }
    }

    void runHealthCheck()

    return () => {
      active = false
      window.clearInterval(clock)
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      requestController?.abort()
    }
  }, [hasConnected, retryVersion])

  useEffect(() => {
    if (!hasConnected) return

    let active = true
    let running = false
    let requestController: AbortController | null = null

    const monitor = async (manual: boolean): Promise<void> => {
      if (!active || running) return
      running = true
      requestController = new AbortController()
      if (manual) setStatus('checking')
      try {
        await checkHealth(requestController.signal)
        if (!active) return
        setError(null)
        setStatus('connected')
      } catch (reason: unknown) {
        if (!active || (reason instanceof Error && reason.name === 'AbortError')) return
        setError(getErrorMessage(reason))
        setStatus('unavailable')
      } finally {
        running = false
      }
    }

    const timer = window.setInterval(() => void monitor(false), MONITOR_INTERVAL_MS)
    if (monitorVersion > 0) void monitor(true)

    return () => {
      active = false
      window.clearInterval(timer)
      requestController?.abort()
    }
  }, [hasConnected, monitorVersion])

  const retry = useCallback(() => {
    setError(null)
    setElapsedMs(0)
    if (connectedRef.current) {
      setStatus('checking')
      setMonitorVersion((version) => version + 1)
    } else {
      setStatus('connecting')
      setRetryVersion((version) => version + 1)
    }
  }, [])

  return { status, hasConnected, elapsedMs, error, retry }
}
