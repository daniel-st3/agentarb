import { useMessages } from "next-intl";
import { translator } from "./core";
export function useCopy() {
  const messages = useMessages();
  return translator((messages.copy ?? {}) as Record<string, unknown>);
}
