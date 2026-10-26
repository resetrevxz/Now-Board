import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { Icon } from './Icon';

export type ToastTone = 'info' | 'success' | 'danger';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  tone?: ToastTone;
  duration?: number;
  action?: ToastAction;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  notify: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return { notify: () => undefined };
  }
  return context;
}

export function ToastProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      const tone = options.tone ?? 'info';
      setItems((current) => [...current.slice(-3), { id, message, tone, action: options.action }]);
      const duration = options.duration ?? (options.action ? 6000 : 3400);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      for (const timer of currentTimers.values()) clearTimeout(timer);
      currentTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {enabled && items.length > 0
        ? createPortal(
            <div className="toast-viewport" aria-live="polite" aria-atomic="false">
              {items.map((item) => (
                <div key={item.id} className={cx('toast', `toast--${item.tone}`)}>
                  <span className="toast__icon" aria-hidden="true">
                    <Icon
                      name={item.tone === 'success' ? 'check-circle' : item.tone === 'danger' ? 'shield' : 'sparkles'}
                      size={16}
                    />
                  </span>
                  <span className="toast__message">{item.message}</span>
                  {item.action ? (
                    <button
                      type="button"
                      className="toast__action"
                      onClick={() => {
                        item.action?.onClick();
                        dismiss(item.id);
                      }}
                    >
                      {item.action.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="toast__close"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss(item.id)}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
