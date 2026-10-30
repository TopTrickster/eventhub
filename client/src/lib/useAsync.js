// Loading data for a screen: every screen gets the same loading/success/error states and a retry.
import { useCallback, useEffect, useState } from 'react';

export function useAsync(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', data: null, error: null });
    load().then(
      (data) => active && setState({ status: 'success', data, error: null }),
      (error) => active && setState({ status: 'error', data: null, error }),
    );
    return () => {
      active = false;
    };
    // The caller lists what `load` depends on, as with useEffect; `attempt` re-runs it on retry.
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback((change) => setState((s) => ({ ...s, data: change(s.data) })), []);
  return { ...state, retry, update };
}

/** Sets the tab title; a screen reader announces it on navigation. */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = `${title} · EventHub`;
  }, [title]);
}
