import React, { useEffect, useRef, useState } from "react";

interface InlineNameInputProps {
  placeholder: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** One-line editor used for creating and renaming groups and channels. */
export function InlineNameInput({
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
}: InlineNameInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter submits, which unmounts this input, which fires native blur — and
  // blur submits too. Without the latch every Enter creates twice.
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        else if (e.key === "Escape") {
          settledRef.current = true;
          onCancel();
        }
      }}
      className="w-full rounded-md border border-sidebar-border bg-transparent px-2 py-1 text-sm text-sidebar-foreground outline-none pointer-events-auto focus:border-sidebar-ring"
    />
  );
}
