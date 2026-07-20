"use client";
import { InputHTMLAttributes, useEffect, useState } from "react";

type NumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  onEmpty?: () => void;
  formatValue?: (value: number | null | undefined) => string;
};

/** 编辑时允许短暂清空，避免空值被立即转换为 0。 */
export function NumericInput({ value, onValueChange, onEmpty, formatValue, onFocus, onBlur, ...props }: NumericInputProps) {
  const format = formatValue ?? ((current: number | null | undefined) => current === null || current === undefined ? "" : String(current));
  const [draft, setDraft] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(format(value)); }, [value, focused, format]);

  return <input {...props} type="text" inputMode="decimal" value={draft}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onChange={event => {
      const next = event.target.value;
      if (!/^-?\d*\.?\d*$/.test(next)) return;
      setDraft(next);
      if (next === "" || next === "-" || next === "." || next === "-.") return;
      const numeric = Number(next);
      if (Number.isFinite(numeric)) onValueChange(numeric);
    }}
    onBlur={event => {
      setFocused(false);
      if (draft === "" || draft === "-" || draft === "." || draft === "-.") onEmpty?.();
      else setDraft(format(value));
      onBlur?.(event);
    }}
  />;
}
