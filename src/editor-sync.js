import { EditorView } from "codemirror";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Wraps one CodeMirror buffer (e.g. a screen's HTML or CSS file) and reconciles
 * it against the on-disk file watched by the server. Mirrors the sync model from
 * the plan: the preview always reflects disk truth; the editor buffer only needs
 * conflict handling because losing keystrokes is the only truly bad outcome.
 */
export class FileSync {
  constructor({ view, saveFn, onConflict, onSaved }) {
    this.view = view;
    this.saveFn = saveFn;
    this.onConflict = onConflict;
    this.onSaved = onSaved;
    this.dirty = false;
    this.saveTimer = null;
    this.pendingExternal = null;
  }

  /** Call when the user types in the editor. */
  markDirtyAndScheduleSave() {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._save(), SAVE_DEBOUNCE_MS);
  }

  async _save() {
    const content = this.view.state.doc.toString();
    const result = await this.saveFn(content);
    this.dirty = false;
    // The server may have rewritten the content (e.g. injecting stable
    // element ids) -- adopt that back into the buffer so it matches disk.
    if (result?.content && result.content !== content) {
      this._replaceContent(result.content);
    }
    this.onSaved?.();
  }

  /** Force any pending debounced save to happen immediately (e.g. before tearing down this buffer). */
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) await this._save();
  }

  /** Call when the server reports a genuine external change to this file. */
  handleExternalChange(content) {
    if (!this.dirty) {
      this._replaceContent(content);
      return;
    }
    // Buffer has unsaved edits: never silently overwrite keystrokes.
    this.pendingExternal = content;
    this.onConflict?.(content);
  }

  /** User chose to discard their local edits and adopt the external content. */
  acceptExternal() {
    if (this.pendingExternal == null) return;
    this._replaceContent(this.pendingExternal);
    this.pendingExternal = null;
    this.dirty = false;
  }

  /** User chose to keep their local edits; external change is dropped. */
  keepLocal() {
    this.pendingExternal = null;
  }

  _replaceContent(content) {
    const current = this.view.state.doc.toString();
    if (current === content) return;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content },
    });
  }
}
