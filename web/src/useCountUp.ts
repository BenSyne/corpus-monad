import { useEffect, useRef, useState } from "react";

/**
 * Eases a displayed number toward its target when the target changes, so figures
 * roll up as money moves instead of snapping. Purely visual — the value passed in
 * is always the real on-chain number.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>();

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(from + (target - from) * ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return shown;
}
