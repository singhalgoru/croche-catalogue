import { useRef, type InputHTMLAttributes } from 'react';
import { formatDate, isValidDate, parseDateInput } from '../../utils/date';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (value: string) => void;
}

export default function DateInput({ value, onChange, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      placeholder="DD/MM/YYYY"
      maxLength={10}
      pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
      value={formatDate(value)}
      onChange={(event) => {
        const date = parseDateInput(event.target.value);
        event.target.setCustomValidity(date && !isValidDate(date)
          ? 'Enter a valid date in DD/MM/YYYY format.' : '');
        onChange(date);
      }}
      onInvalid={() => {
        if (inputRef.current) {
          inputRef.current.setCustomValidity('Enter a valid date in DD/MM/YYYY format.');
        }
      }}
    />
  );
}
