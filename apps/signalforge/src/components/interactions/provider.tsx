"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import dynamic from "next/dynamic";

const Palette = dynamic(() => import("./command-palette"), { ssr: false });
const loadFeatures = () =>
  import("./features").then((module) => module.default);
const Launcher = createContext<() => void>(() => {});
export const useCommandPalette = () => useContext(Launcher);
export function useInteractionTiming() {
  const reduced = useReducedMotion();
  return {
    reduced: reduced !== false,
    transition: { duration: reduced !== false ? 0 : 0.18 },
  };
}
export function InteractionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!event.repeat) setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        <Launcher.Provider value={() => setOpen(true)}>
          {children}
          <AnimatePresence>
            {open && <Palette key="launcher" close={() => setOpen(false)} />}
          </AnimatePresence>
        </Launcher.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}
