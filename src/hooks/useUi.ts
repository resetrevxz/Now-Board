import { useEffect, useRef, useState, type RefObject } from 'react';

export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const handlePointer = (event: PointerEvent) => {
      const node = ref.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        closeRef.current();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [active, ref]);
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}
