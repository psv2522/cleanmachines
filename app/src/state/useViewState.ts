import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { parseViewState, serializeViewState, type ViewState } from './viewState'

const NAVIGATE_EVENT = 'app:navigate'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

const getSearch = () => window.location.search

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean
}

export type Navigate = (
  update: Partial<ViewState> | ((current: ViewState) => ViewState),
  options?: NavigateOptions,
) => void

export function navigateTo(next: ViewState, { replace = false }: NavigateOptions = {}) {
  const search = serializeViewState(next)
  if (search === window.location.search) return
  const url = `${window.location.pathname}${search}${window.location.hash}`
  if (replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/**
 * The URL is the single source of truth for search, filters and the open event, so
 * refresh, back/forward and copied links all restore the same view.
 */
export function useViewState(): [ViewState, Navigate] {
  const search = useSyncExternalStore(subscribe, getSearch, () => '')
  const state = useMemo(() => parseViewState(search), [search])

  useEffect(() => {
    const canonical = serializeViewState(state)
    if (canonical !== search) navigateTo(state, { replace: true })
  }, [search, state])

  const navigate = useCallback<Navigate>((update, options) => {
    const current = parseViewState(window.location.search)
    const next = typeof update === 'function' ? update(current) : { ...current, ...update }
    navigateTo(next, options)
  }, [])

  return [state, navigate]
}
