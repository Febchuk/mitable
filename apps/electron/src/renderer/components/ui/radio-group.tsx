import * as React from "react";

import { cn } from "@/lib/utils";

type RadioGroupContextValue = {
  name: string;
  value: string | undefined;
  setValue: (next: string) => void;
  disabled?: boolean;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

function useRadioGroupContext() {
  const ctx = React.useContext(RadioGroupContext);
  if (!ctx) throw new Error("RadioGroupItem must be used within a RadioGroup");
  return ctx;
}

export type RadioGroupProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "onChange" | "defaultValue"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, defaultValue, onValueChange, disabled, ...props }, ref) => {
    const name = React.useId();
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState<string | undefined>(
      defaultValue
    );

    const currentValue = isControlled ? value : uncontrolledValue;

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setUncontrolledValue(next);
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
    );

    return (
      <RadioGroupContext.Provider value={{ name, value: currentValue, setValue, disabled }}>
        <div ref={ref} role="radiogroup" className={cn("grid gap-2", className)} {...props} />
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

export type RadioGroupItemProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "name" | "value" | "checked" | "defaultChecked" | "onChange"
> & {
  value: string;
};

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const ctx = useRadioGroupContext();
    const checked = ctx.value === value;
    const isDisabled = ctx.disabled || disabled;

    return (
      <input
        ref={ref}
        type="radio"
        name={ctx.name}
        value={value}
        disabled={isDisabled}
        checked={checked}
        onChange={() => ctx.setValue(value)}
        data-state={checked ? "checked" : "unchecked"}
        className={cn(className)}
        {...props}
      />
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };

