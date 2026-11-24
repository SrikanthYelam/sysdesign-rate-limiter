import { useEffect, useState } from 'react';

/** Re-renders the calling component once per animation frame. */
export function useAnimationFrame(): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let handle = requestAnimationFrame(function loop(t) {
      setTime(t);
      handle = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(handle);
  }, []);
  return time;
}
