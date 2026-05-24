"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

type PaneSplitterProps = {
  label: string;
  onDrag: (deltaX: number) => void;
  onKeyboardResize: (deltaX: number) => void;
};

export function PaneSplitter({
  label,
  onDrag,
  onKeyboardResize,
}: PaneSplitterProps) {
  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    let lastX = event.clientX;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaX = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      onDrag(deltaX);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onKeyboardResize(-24);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onKeyboardResize(24);
    }
  }

  return (
    <div className="research-pane-splitter">
      <button
        type="button"
        aria-label={label}
        aria-orientation="vertical"
        className="research-pane-splitter-button"
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
      </button>
    </div>
  );
}
