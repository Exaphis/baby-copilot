import { useState } from "react";

export default function App() {
  const [leftContent, setLeftContent] = useState("");
  const [rightContent, setRightContent] = useState("");

  return (
    <div className="app-shell">
      <main className="app-main">
        <section className="input-section">
          <label className="field">
            <span className="field-label">Left content</span>
            <textarea
              className="field-control"
              value={leftContent}
              onChange={(event) => setLeftContent(event.target.value)}
              placeholder="Paste or type your left-hand content"
              rows={12}
            />
          </label>
          <label className="field">
            <span className="field-label">Right content</span>
            <textarea
              className="field-control"
              value={rightContent}
              onChange={(event) => setRightContent(event.target.value)}
              placeholder="Paste or type your right-hand content"
              rows={12}
            />
          </label>
        </section>
        <section className="output-section">
          <div className="output-surface has-output">
            <p className="empty-state">
              Renderer removed from core. Diff previews are disabled for now.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
