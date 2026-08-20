interface RunSetupFormProps {
  variants: number;
  repeats: number;
  onVariantsChange: (n: number) => void;
  onRepeatsChange: (n: number) => void;
}

/** Number input with a visible label and 44px-min touch target. */
function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flex: '1 1 160px',
        minWidth: 160,
      }}
    >
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: 14 }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="tabular"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0);
        }}
        style={{
          minHeight: 44,
          fontSize: 16,
          padding: '8px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      />
    </div>
  );
}

export default function RunSetupForm({
  variants,
  repeats,
  onVariantsChange,
  onRepeatsChange,
}: RunSetupFormProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 16,
      }}
    >
      <NumberField
        id="variants"
        label="Variants"
        value={variants}
        onChange={onVariantsChange}
        min={0}
        max={1000}
      />
      <NumberField
        id="repeats"
        label="Repeats"
        value={repeats}
        onChange={onRepeatsChange}
        min={0}
        max={1000}
      />
    </section>
  );
}
