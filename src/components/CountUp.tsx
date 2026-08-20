import { useEffect, useRef, useState } from 'react';

/** Animated count-up. Renders the final value at once under prefers-reduced-motion. */
export default function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const reduced = useRef(
    typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [shown, setShown] = useState(reduced.current ? value : 0);

  useEffect(() => {
    if (reduced.current) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = 500;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="tabular" aria-label={`${value}${suffix}`}>
      {shown}
      {suffix}
    </span>
  );
}
