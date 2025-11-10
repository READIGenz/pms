// pms-frontend/src/utils/scrollLock.ts
let lockCount = 0;

export function lockScroll() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    // remember previous overflow to restore exactly
    (document.body as any).__prevOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

export function unlockScroll() {
  if (typeof document === "undefined") return;
  if (lockCount > 0) lockCount -= 1;
  if (lockCount === 0) {
    const prev = (document.body as any).__prevOverflow || "";
    document.body.style.overflow = prev;
    try { delete (document.body as any).__prevOverflow; } catch {}
  }
}

export function getScrollLockCount() {
  return lockCount;
}
