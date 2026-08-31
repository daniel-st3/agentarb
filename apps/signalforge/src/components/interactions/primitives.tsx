"use client";
import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, m, useIsPresent } from "motion/react";
import { useInteractionTiming } from "./provider";

const definitions = {
  cached_live:
    "Previously observed public metadata, served from cache. Not a new live observation.",
  catalog_only: "A catalog description, not a callable or approved service.",
  execution_not_enabled:
    "Planning and inspection only. No service calls, marketplace actions or payments.",
};
export function TechnicalLabel({ term }: { term: keyof typeof definitions }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { transition } = useInteractionTiming();
  return (
    <span
      className="technical-label"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {term}
      </button>
      <span id={id} className="sr-only">
        {definitions[term]}
      </span>
      <AnimatePresence>
        {open && (
          <m.span
            className="technical-tip"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {definitions[term]}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}
export function InteractionError({ message }: { message: string }) {
  const { reduced, transition } = useInteractionTiming();
  return (
    <AnimatePresence>
      {message && (
        <m.p
          key="validation"
          role="alert"
          className="error-message"
          data-motion-owner="motion"
          initial={{ opacity: 0, y: reduced ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={transition}
        >
          {message}
        </m.p>
      )}
    </AnimatePresence>
  );
}
export function ResultTransition({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const { transition } = useInteractionTiming();
  return (
    <m.div
      data-motion-owner="motion"
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      initial={{ opacity: 0.65 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      {children}
    </m.div>
  );
}
