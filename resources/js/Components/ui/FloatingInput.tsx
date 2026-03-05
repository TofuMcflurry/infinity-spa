import { ChangeEvent, InputHTMLAttributes } from 'react';

// extend the standard input attributes so we can pass value, onChange, name, etc.
interface FloatingInputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  type?: string;
}

const FloatingInput = ({
  id,
  label,
  type = 'text',
  name,
  value,
  onChange,
  required,
  ...rest
}: FloatingInputProps) => {
  return (
    <div className="floating-label-group">
      <input
        type={type}
        id={id}
        name={name || id}
        value={value}
        onChange={onChange as (e: ChangeEvent<HTMLInputElement>) => void}
        placeholder=" "
        required={required}
        {...rest}
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
};

export default FloatingInput;
