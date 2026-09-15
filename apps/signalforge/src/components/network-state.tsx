"use client";
import { useCopy } from "@/i18n/copy";

import { createContext, useContext, useEffect, useState } from "react";
import { z } from "zod";
import { NetworkStatusSchema } from "@/domain/intelligence";
type State = {
  status: z.infer<typeof NetworkStatusSchema> | null;
  loading: boolean;
};
const Context = createContext<State>({ status: null, loading: true });
export function NetworkState({ children, initialStatus=null }: { children: React.ReactNode;initialStatus?:State["status"] }) {
  const [state, setState] = useState<State>({ status: initialStatus, loading: !initialStatus });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/network/status", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return NetworkStatusSchema.parse(await r.json());
      })
      .then((status) => setState({ status, loading: false }))
      .catch(() => {
        if (!controller.signal.aborted)
          setState(previous=>({ status: previous.status, loading: false }));
      });
    return () => controller.abort();
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export const useNetworkState = () => useContext(Context);
export function NetworkIndicator() {
  const t = useCopy();

  const { status, loading } = useNetworkState();
  return (
    <span
      className="network-indicator"
      data-available={Boolean(status?.observedCount)}
    >
      <i aria-hidden="true" />
      {t("NETWORK /")}{" "}
      {t(
        loading
          ? "LOADING"
          : status?.observedCount
            ? `${status.observedCount} ${t("OBSERVED")}`
            : "UNAVAILABLE",
      )}
    </span>
  );
}
