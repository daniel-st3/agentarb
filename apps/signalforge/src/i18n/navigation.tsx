import { createNavigation } from "next-intl/navigation";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { routing, machinePath } from "./routing";
const navigation = createNavigation(routing);
export const { useRouter, usePathname, redirect, getPathname } = navigation;
export function Link(
  props: Omit<ComponentProps<typeof NextLink>, "locale"> & { locale?: string },
) {
  const path =
    typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  return machinePath(path) || !path.startsWith("/") ? (
    <NextLink {...props} />
  ) : (
    <navigation.Link {...props} />
  );
}
export default Link;
