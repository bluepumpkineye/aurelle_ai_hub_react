/**
 * Command-based undo/redo stack. Depth ≥ 20 (PRD §2). Every mutating
 * operation on slot states or fixture placement pushes an inverse command.
 */

export interface Command {
  label: string;
  undo(): void;
  redo(): void;
}

export class UndoStack {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(private readonly maxDepth: number = 32) {}

  push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): string | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    return cmd.label;
  }

  redo(): string | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    return cmd.label;
  }

  get depth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  peekLabel(): string | null {
    return this.undoStack.length ? this.undoStack[this.undoStack.length - 1].label : null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
