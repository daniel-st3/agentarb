import { getRequestConfig } from "next-intl/server";
import { safeLocale } from "./routing";
import { messagesForLocale } from "./messages";
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const selected = safeLocale(locale ?? (await requestLocale));
  return {
    locale: selected,
    messages: { copy: messagesForLocale(selected) },
    timeZone: "UTC",
  };
});
