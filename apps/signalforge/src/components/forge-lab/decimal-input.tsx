import { useLocale } from "next-intl";
import type { InputHTMLAttributes } from "react";

export function decimalSeparator(locale: string) {
  return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
}

/** Browser number widgets may use the OS locale instead of the page language.
 * Keep the canonical decimal string untouched; only localize its separator. */
export function DecimalInput({ value, onValue, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string; onValue: (value: string) => void }) {
  const locale = useLocale();
  const separator = decimalSeparator(locale);
  return <input {...props} type="text" inputMode="decimal" lang={locale}
    pattern={separator === "," ? "[0-9]+([.,][0-9]+)?" : "[0-9]+(\\.[0-9]+)?"}
    value={value.replace(".", separator)}
    onChange={(event) => onValue(event.target.value.replace(separator, "."))} />;
}
