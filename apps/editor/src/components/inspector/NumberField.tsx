import { useEffect, useState } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  testId?: string;
  step?: number;
}

/** Labeled numeric input; commits on blur/Enter, reverts on Escape. */
export function NumberField({ label, value, onCommit, testId, step = 1 }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(round(value)));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(String(round(value)));
  }, [value]);

  const commit = () => {
    // A native number input coerces an unparseable typed value (e.g. "abc") to
    // "" in its .value, and Number('') is 0 (finite) — guard the empty string
    // explicitly so an invalid entry reverts instead of silently committing 0.
    const parsed = draft.trim() === '' ? NaN : Number(draft);
    if (Number.isFinite(parsed)) {
      setInvalid(false);
      onCommit(parsed);
    } else {
      // Silent reverts leave the user unsure whether their edit "took" —
      // flag the field briefly so the rejection is visible, not just implied
      // by the value snapping back.
      setDraft(String(round(value)));
      setInvalid(true);
    }
  };

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-4 text-secondary-app">{label}</span>
      <input
        data-testid={testId}
        type="number"
        step={step}
        aria-invalid={invalid}
        className={
          'w-full min-w-0 rounded border bg-transparent px-1 py-0.5 border-app' +
          (invalid ? ' border-red-500 outline outline-1 outline-red-500' : '')
        }
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (invalid) setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(String(round(value)));
            setInvalid(false);
            e.currentTarget.blur();
          }
        }}
      />
      {invalid && (
        <span
          role="alert"
          data-testid={testId ? `${testId}-invalid` : undefined}
          className="text-[10px] text-red-500"
        >
          Invalid
        </span>
      )}
    </label>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
