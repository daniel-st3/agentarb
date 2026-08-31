import { translations } from "../../messages/translations";
import { messageKey, translator } from "./core";
import { safeLocale } from "./routing";
export function messagesForLocale(locale: string) {
  const column =
    safeLocale(locale) === "es" ? 1 : safeLocale(locale) === "fr" ? 2 : 0;
  return Object.fromEntries(
    translations.map((row) => [
      row[0].includes("{0}")
        ? `template:${encodeURIComponent(row[0]).replaceAll(".", "%2E")}`
        : messageKey(row[0]),
      row[column],
    ]),
  );
}
export const copyForLocale = (locale: string) =>
  translator(messagesForLocale(locale));
