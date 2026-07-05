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

  useEffect(() => {
    setDraft(String(round(value)));
  }, [value]);

  const commit = () => {
    // A native number input coerces an unparseable typed value (e.g. "abc") to
    // "" in its .value, and Number('') is 0 (finite) — guard the empty string
    // explicitly so an invalid entry reverts instead of silently committing 0.
    const parsed = draft.trim() === '' ? NaN : Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(round(value)));
  };

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-4 text-secondary-app">{label}</span>
      <input
        data-testid={testId}
        type="number"
        step={step}
        className="w-full min-w-0 rounded border bg-transparent px-1 py-0.5 border-app"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setDraft(String(round(value)));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
