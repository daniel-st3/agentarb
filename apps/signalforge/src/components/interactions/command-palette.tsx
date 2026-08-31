"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { ObjectiveInputSchema } from "@/domain/objective";
import { useInteractionTiming } from "./provider";

const examples = [
  "Build a verification-first due-diligence route under $0.25",
  "Find the lowest-cost route to extract structured website data",
  "Create a recurring competitor-monitoring route",
];
export default function CommandPalette({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [objective, setObjective] = useState("");
  const [error, setError] = useState("");
  const { reduced, transition } = useInteractionTiming();
  const router = useRouter();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    const overflow = document.body.style.overflow;
    node.showModal();
    input.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function navigate(path: string) {
    close();
    router.push(path);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ObjectiveInputSchema.shape.objective.safeParse(objective);
    if (!parsed.success) {
      setError(
        "Use a clear objective of 12–2,000 characters. Keep credentials and executable instructions out.",
      );
      return;
    }
    navigate(`/forge?objective=${encodeURIComponent(parsed.data)}`);
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-labelledby="launcher-title"
      aria-describedby="launcher-note"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          dialog.current!.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input, a[href]",
          ),
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <m.div
        className="launcher-backdrop"
        data-motion-owner="motion"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <m.section
          className="launcher-sheet"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.99 }}
          transition={transition}
        >
          <div className="launcher-heading">
            <span className="eyebrow">SIGNALFORGE / OBJECTIVE LAUNCHER</span>
            <button
              type="button"
              className="launcher-close"
              aria-label="Close command palette"
              onClick={close}
            >
              <X size={18} />
            </button>
          </div>
          <h2 id="launcher-title">Forge a route</h2>
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="launcher-objective">
              Describe an objective
            </label>
            <input
              ref={input}
              id="launcher-objective"
              placeholder="Describe an objective…"
              maxLength={2000}
              value={objective}
              onChange={(event) => {
                setObjective(event.target.value);
                setError("");
              }}
              aria-describedby={error ? "launcher-error" : "launcher-note"}
              aria-invalid={!!error}
            />
            {error && (
              <p id="launcher-error" role="alert" className="error-message">
                {error}
              </p>
            )}
            <button className="text-link launcher-submit" type="submit">
              Forge this objective <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </form>
          <ul className="launcher-examples" aria-label="Example objectives">
            {examples.map((example, index) => (
              <m.li
                key={example}
                initial={reduced ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...transition,
                  delay: reduced ? 0 : index * 0.025,
                }}
              >
                <m.button
                  whileFocus={{ x: reduced ? 0 : 2 }}
                  whileTap={{ opacity: reduced ? 1 : 0.8 }}
                  transition={transition}
                  onClick={() => {
                    setObjective(example);
                    setError("");
                    input.current?.focus();
                  }}
                >
                  <span aria-hidden="true">0{index + 1}</span>
                  {example}
                </m.button>
              </m.li>
            ))}
          </ul>
          <div className="launcher-destinations">
            <button className="text-link" onClick={() => navigate("/network")}>
              Explore Live Network ↗
            </button>
            <button
              className="text-link"
              onClick={() => navigate("/developers/try")}
            >
              Inspect API / MCP ↗
            </button>
          </div>
          <p id="launcher-note" className="field-help">
            Planning only. No services called. Objectives open in the route
            console; do not include private information.
          </p>
          <p className="launcher-shortcuts">
            TAB / NAVIGATE <span>ESC / CLOSE</span>
          </p>
        </m.section>
      </m.div>
    </dialog>,
    document.body,
  );
}
