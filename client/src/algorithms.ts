import type { AlgorithmConfig, AlgorithmType } from './api'

export type ConfigField = {
  key: keyof AlgorithmConfig
  label: string
  description: string
  unit: string
  defaultValue: string
  step?: string
}

export type AlgorithmDefinition = {
  id: AlgorithmType
  name: string
  shortName: string
  description: string
  behavior: string
  flowSteps: [string, string, string]
  fields: ConfigField[]
  windowField?: keyof AlgorithmConfig
}

export const algorithms: AlgorithmDefinition[] = [
  {
    id: 'TOKEN_BUCKET',
    name: 'Token Bucket',
    shortName: 'Token',
    description: 'Tokens refill over time; each allowed request spends one.',
    behavior: 'Can allow bursts up to the configured bucket capacity.',
    flowSteps: [
      'Refill tokens based on elapsed time, up to capacity.',
      'Check whether at least one token is available.',
      'Spend one token to allow, or reject and return retry time.',
    ],
    fields: [
      { key: 'capacity', label: 'Bucket capacity', description: 'Maximum tokens held at once.', unit: 'tokens', defaultValue: '5' },
      { key: 'refillTokens', label: 'Refill amount', description: 'Tokens added each refill period.', unit: 'tokens', defaultValue: '1' },
      { key: 'refillPeriodSeconds', label: 'Refill period', description: 'Time between refill amounts.', unit: 'seconds', defaultValue: '2' },
    ],
  },
  {
    id: 'LEAKY_BUCKET',
    name: 'Leaky Bucket',
    shortName: 'Leaky',
    description: 'Requests fill a bucket that drains at a steady rate.',
    behavior: 'Overflow is rejected by this backend; requests are not queued.',
    flowSteps: [
      'Drain the bucket according to elapsed time and drain rate.',
      'Check whether one more request fits within capacity.',
      'Add it if there is room; otherwise reject without queuing.',
    ],
    fields: [
      { key: 'capacity', label: 'Bucket capacity', description: 'Maximum work units held in the bucket.', unit: 'requests', defaultValue: '5' },
      { key: 'leakRatePerSecond', label: 'Drain rate', description: 'Bucket units removed each second.', unit: 'requests / sec', defaultValue: '1', step: 'any' },
    ],
  },
  {
    id: 'FIXED_WINDOW_COUNTER',
    name: 'Fixed Window Counter',
    shortName: 'Fixed',
    description: 'Counts requests within aligned, fixed-duration windows.',
    behavior: 'The counter resets at the backend’s fixed window boundary.',
    flowSteps: [
      'Find the current aligned time window.',
      'Compare its request count with the configured limit.',
      'Allow and increment, or reject until the next window.',
    ],
    fields: [
      { key: 'maximumRequests', label: 'Request limit', description: 'Maximum allowed requests in one window.', unit: 'requests', defaultValue: '5' },
      { key: 'windowSeconds', label: 'Window duration', description: 'Length of each fixed window.', unit: 'seconds', defaultValue: '10' },
    ],
    windowField: 'windowSeconds',
  },
  {
    id: 'SLIDING_WINDOW_LOG',
    name: 'Sliding Window Log',
    shortName: 'Log',
    description: 'Tracks request timestamps and expires them as the window moves.',
    behavior: 'The backend checks precise request timestamps in the rolling window.',
    flowSteps: [
      'Remove request timestamps outside the rolling window.',
      'Count the timestamps that are still inside it.',
      'Allow and record this timestamp, or reject at the limit.',
    ],
    fields: [
      { key: 'maximumRequests', label: 'Request limit', description: 'Maximum allowed requests in the window.', unit: 'requests', defaultValue: '5' },
      { key: 'windowSeconds', label: 'Window duration', description: 'Length of the rolling window.', unit: 'seconds', defaultValue: '10' },
    ],
    windowField: 'windowSeconds',
  },
  {
    id: 'SLIDING_WINDOW_COUNTER',
    name: 'Sliding Window Counter',
    shortName: 'Counter',
    description: 'Weights the previous window and combines it with the current count.',
    behavior: 'This backend uses an estimated weighted count, not a request log.',
    flowSteps: [
      'Read the current and previous fixed-window counts.',
      'Weight the previous count by how much of its window remains.',
      'Allow if the estimated total fits; otherwise reject.',
    ],
    fields: [
      { key: 'maximumRequests', label: 'Request limit', description: 'Maximum estimated requests in the window.', unit: 'requests', defaultValue: '5' },
      { key: 'windowSeconds', label: 'Window duration', description: 'Length of each counter window.', unit: 'seconds', defaultValue: '10' },
    ],
    windowField: 'windowSeconds',
  },
]

export function defaultsFor(algorithm: AlgorithmDefinition): Record<string, string> {
  return Object.fromEntries(algorithm.fields.map((field) => [field.key, field.defaultValue]))
}
