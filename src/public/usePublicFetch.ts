import { useCallback, useEffect, useState } from 'react'
import { readPublicCache, writePublicCache } from './publicApiCache'

interface PublicFetchState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refreshing: boolean
  retry: () => void
}

export function usePublicFetch<T>(
  cacheKey: string,
  loader: () => Promise<T>,
): PublicFetchState<T> {
  const initial = readPublicCache<T>(cacheKey)
  const [data, setData] = useState<T | null>(initial?.data ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(initial == null)
  const [refreshing, setRefreshing] = useState(initial?.status === 'stale')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const cached = readPublicCache<T>(cacheKey)
    if (cached?.status === 'fresh') {
      setData(cached.data)
      setError(null)
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (cached?.status === 'stale') {
      setData(cached.data)
      setLoading(false)
      setRefreshing(true)
    } else {
      setLoading(true)
      setRefreshing(false)
    }

    loader()
      .then((result) => {
        if (cancelled) return
        writePublicCache(cacheKey, result)
        setData(result)
        setError(null)
        setLoading(false)
        setRefreshing(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        if (!cached) setData(null)
        setError(cause instanceof Error ? cause.message : 'Request failed.')
        setLoading(false)
        setRefreshing(false)
      })

    return () => { cancelled = true }
  }, [cacheKey, loader, attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return { data, error, loading, refreshing, retry }
}
