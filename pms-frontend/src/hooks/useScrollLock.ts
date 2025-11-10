// pms-frontend/src/hooks/useScrollLock.ts
import { useEffect, useRef } from "react";
import { lockScroll, unlockScroll } from "../utils/scrollLock";

/**
 * Locks body scroll while `on` is true.
 * Safe across multiple callers (ref-counted).
 */
export function useScrollLock(on: boolean) {
  const wasOn = useRef(false);

  useEffect(() => {
    if (on && !wasOn.current) {
      lockScroll();
      wasOn.current = true;
    } else if (!on && wasOn.current) {
      unlockScroll();
      wasOn.current = false;
    }
    return () => {
      if (wasOn.current) {
        unlockScroll();
        wasOn.current = false;
      }
    };
  }, [on]);
}
