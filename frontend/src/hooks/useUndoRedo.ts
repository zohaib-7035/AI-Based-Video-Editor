import { useCallback, useRef, useState } from "react";

interface UndoRedoResult<T> {
  state: T;
  push: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initial: T): UndoRedoResult<T> {
  const [present, setPresent] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, rerender] = useState(0);

  const push = useCallback((next: T) => {
    past.current.push(present);
    future.current = [];
    setPresent(next);
    rerender((n) => n + 1);
  }, [present]);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    const prev = past.current.pop()!;
    future.current.unshift(present);
    setPresent(prev);
    rerender((n) => n + 1);
  }, [present]);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    const next = future.current.shift()!;
    past.current.push(present);
    setPresent(next);
    rerender((n) => n + 1);
  }, [present]);

  return {
    state: present,
    push,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
