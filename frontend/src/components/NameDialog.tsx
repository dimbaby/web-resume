import { useState, type FormEvent } from "react";

type Props = {
  title: string;
  message: string;
  initialValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function NameDialog({
  title,
  message,
  initialValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = value.trim();
    if (!normalized) {
      setError("版本名称不能为空。");
      return;
    }
    onConfirm(normalized);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="name-dialog-title">{title}</h2>
        <p>{message}</p>
        <label>
          版本名称
          <input
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && <span className="modal-field-error">{error}</span>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="primary-button">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
