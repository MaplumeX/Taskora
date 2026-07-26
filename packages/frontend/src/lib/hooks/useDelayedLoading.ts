import { useEffect, useState } from 'react';

/**
 * Only show a loading state after `delay` ms has elapsed.
 * Quick responses (< delay) render nothing, avoiding flash.
 */
export function useDelayedLoading(isLoading: boolean, delay = 200): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [isLoading, delay]);

  return show;
}
