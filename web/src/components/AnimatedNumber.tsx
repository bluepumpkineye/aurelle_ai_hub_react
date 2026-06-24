import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "framer-motion";

// Count-up number (cult-ui-style ticker). Animates 0 → value on mount and
// re-animates whenever value changes (e.g. when filters update).
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 55, damping: 18, mass: 1 });

  useEffect(() => {
    if (ref.current) ref.current.textContent = format(0);
    mv.set(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = format(v);
    });
  }, [spring, format]);

  return <span ref={ref}>{format(value)}</span>;
}
