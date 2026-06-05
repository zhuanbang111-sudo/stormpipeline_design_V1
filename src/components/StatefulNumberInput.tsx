import React, { useState, useEffect } from 'react';

interface StatefulNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  step?: string;
  placeholder?: string;
}

export default function StatefulNumberInput({
  value,
  onChange,
  className,
  step = "0.01",
  placeholder
}: StatefulNumberInputProps) {
  // We use standard string state to allow trailing decimals like '102.' and empty text during typing
  const [localValue, setLocalValue] = useState<string>(value.toString());
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // Sync state if value prop changes from outside (e.g. database reload or simulation run)
  // but protect local state when the user is actively focused and typing
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(typeof value === 'number' && !isNaN(value) ? value.toString() : '');
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawStr = e.target.value;
    setLocalValue(rawStr);
    
    // Parse the value only if it's a valid floating number to propagate up
    const parsed = parseFloat(rawStr);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localValue);
    if (isNaN(parsed)) {
      // Revert to original prop value on invalid blur
      setLocalValue(value.toString());
    } else {
      setLocalValue(parsed.toString());
      onChange(parsed);
    }
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      step={step}
      placeholder={placeholder}
      className={className}
    />
  );
}
