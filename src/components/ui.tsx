import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './Icon';

type ButtonVariant = 'accent' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn--${variant}`, `btn--${size}`, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children ? <span className="btn__label">{children}</span> : null}
      {trailingIcon ? <Icon name={trailingIcon} size={size === 'sm' ? 14 : 16} /> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: IconName;
  variant?: 'ghost' | 'subtle' | 'danger';
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'icon-btn',
        `icon-btn--${variant}`,
        `icon-btn--${size}`,
        active && 'is-active',
        className,
      )}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 15 : 18} />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('toggle', checked && 'is-on')}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle__thumb" />
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx('segmented__item', option.value === value && 'is-active')}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <Icon name={option.icon} size={14} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Ring({
  value,
  size = 56,
  stroke = 5,
  color,
  trackOpacity = 1,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackOpacity?: number;
  children?: ReactNode;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div
      className={cx('ring', className)}
      style={{ width: size, height: size, color: color ?? 'var(--accent)' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          opacity={trackOpacity}
        />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children ? <span className="ring__content">{children}</span> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  color,
  className,
  label,
}: {
  value: number;
  color?: string;
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cx('progress', className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span
        className="progress__fill"
        style={{ width: `${clamped}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('section-label', className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  detail,
  compact = false,
  action,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={cx('empty-state', compact && 'empty-state--compact')}>
      <div className="empty-state__icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 22} />
      </div>
      <div className="empty-state__copy">
        <p className="empty-state__title">{title}</p>
        {detail ? <p className="empty-state__detail">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target.focus();
    });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, panelRef]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'center' | 'drawer';
  className?: string;
  hideClose?: boolean;
  labelledBy?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  className,
  hideClose = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useDialogFocus(panelRef, open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('scrim', variant === 'drawer' && 'scrim--drawer')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx(
          'dialog',
          variant === 'drawer' ? 'drawer' : 'dialog--center',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="dialog__head">
          <div>
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="dialog__description">
                {description}
              </p>
            ) : null}
          </div>
          {hideClose ? null : (
            <IconButton label="Close" icon="x" onClick={onClose} />
          )}
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onClose,
  busy = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'accent';
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      className="confirm-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'accent'}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-dialog__rule" />
    </Modal>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('field', className)}>
      <div className="field__head">
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint ? <span className="field__hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function InlineToggle({
  checked,
  onChange,
  label,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-toggle">
      <span className="inline-toggle__copy">
        <span className="inline-toggle__label">{label}</span>
        {detail ? <span className="inline-toggle__detail">{detail}</span> : null}
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </label>
  );
}

export function useTransientFlag(durationMs = 2600): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = () => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), durationMs);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [on, trigger];
}
