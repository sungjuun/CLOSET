import { useRef, useState } from 'react';
import { authErrorMessage } from './errors';

export function useAuthAction() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function run(action: () => Promise<string | void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(result ?? null);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { pending, error, message, run };
}
