import { getLocale } from "next-intl/server";
import { copyForLocale } from "./messages";
export async function getCopy() {
  return copyForLocale(await getLocale());
}
