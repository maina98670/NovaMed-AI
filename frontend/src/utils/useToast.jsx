import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const node = toast ? <div className={`toast ${toast.kind}`}>{toast.msg}</div> : null;
  return { show, node };
}
