export type SelectOption = { value: string; label: string };
export type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
  borderless?: boolean;
};
