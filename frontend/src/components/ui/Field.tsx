import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export const inputClass =
  "w-full rounded-[var(--radius-input)] border border-border-strong bg-surface px-3 py-2 text-fg placeholder:text-muted/80 transition-colors focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 aria-[invalid=true]:border-danger";

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = [error && `${fieldId}-err`, hint && `${fieldId}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="font-medium">
        {label}
      </label>
      <input ref={ref} id={fieldId} aria-invalid={!!error} aria-describedby={describedBy} className={cn(inputClass, "h-10")} {...rest} />
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-err`} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className="font-medium">
        {label}
      </label>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        className={cn(inputClass, "min-h-24 resize-y")}
        {...rest}
      />
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-err`} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
