import { useEffect, useMemo, useState } from "react";
import {
  ConversionOptions,
  SvgCodeRenderer,
  dmpDiff,
} from "@baby-copilot/core";
import type { DiffRange } from "@baby-copilot/core";

const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export default function App() {
  const [leftContent, setLeftContent] = useState("");
  const [rightContent, setRightContent] = useState("");
  const [language, setLanguage] = useState("");
  const [outputUris, setOutputUris] = useState<{
    left: string | null;
    right: string | null;
  }>({ left: null, right: null });
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendererReady, setRendererReady] = useState(false);

  const renderer = useMemo(() => SvgCodeRenderer.getInstance(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await renderer.setTheme("dark-plus");
        if (!cancelled) {
          setRendererReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize renderer", err);
        if (!cancelled) {
          setError("Failed to initialize renderer");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [renderer]);

  useEffect(() => {
    let disposed = false;

    if (!rendererReady) {
      return () => {
        disposed = true;
      };
    }

    const trimmedLanguage = language.trim() || "typescript";
    const hasInput =
      leftContent.trim().length > 0 || rightContent.trim().length > 0;

    if (!hasInput) {
      setOutputUris({ left: null, right: null });
      setError(null);
      return () => {
        disposed = true;
      };
    }

    const diff = dmpDiff(leftContent, rightContent);

    const fontSize = 14;
    const lineHeight = Math.round(fontSize * 1.5);
    const charWidth = fontSize * 0.6;
    const padding = 32;

    function measureContent(content: string) {
      const lines = content.split(/\r\n|\r|\n/);
      const lineCount = Math.max(1, lines.length);
      const longestLine = lines.reduce(
        (max, line) => Math.max(max, line.length),
        0
      );
      return { lineCount, longestLine };
    }

    const shouldRenderLeftOnly =
      diff.left.length > 0 && diff.right.length === 0;
    const shouldRenderRightOnly =
      diff.right.length > 0 && diff.left.length === 0;

    type TargetKey = "left" | "right";
    interface RenderTarget {
      key: TargetKey;
      content: string;
      ranges: DiffRange[];
    }

    const targets: RenderTarget[] = [];

    if (!shouldRenderRightOnly && (leftContent.length > 0 || !shouldRenderLeftOnly)) {
      targets.push({ key: "left", content: leftContent, ranges: diff.left });
    }

    if (!shouldRenderLeftOnly && (rightContent.length > 0 || !shouldRenderRightOnly)) {
      targets.push({ key: "right", content: rightContent, ranges: diff.right });
    }

    if (targets.length === 0) {
      setOutputUris({ left: null, right: null });
      setError(null);
      setIsRendering(false);
      return () => {
        disposed = true;
      };
    }

    setIsRendering(true);
    setError(null);

    (async () => {
      try {
        const entries = await Promise.all(
          targets.map(async (target) => {
            const { lineCount, longestLine } = measureContent(target.content);
            const width = Math.min(
              1200,
              Math.max(320, Math.round(longestLine * charWidth + padding))
            );
            const height = Math.max(lineHeight, lineCount * lineHeight);

            const options: ConversionOptions = {
              imageType: "svg",
              fontFamily: FONT_FAMILY,
              fontSize,
              lineHeight,
              dimensions: { width, height },
            };

            const dataUri = await renderer.getDataUri(
              target.content,
              trimmedLanguage,
              options,
              target.ranges
            );

            return [target.key, dataUri] as const;
          })
        );

        if (!disposed) {
          const nextUris: { left: string | null; right: string | null } = {
            left: null,
            right: null,
          };
          for (const [key, value] of entries) {
            nextUris[key] = value;
          }
          if (shouldRenderLeftOnly) {
            nextUris.right = null;
          }
          if (shouldRenderRightOnly) {
            nextUris.left = null;
          }
          setOutputUris(nextUris);
        }
      } catch (err) {
        console.error("Failed to render diff", err);
        if (!disposed) {
          setOutputUris({ left: null, right: null });
          setError("Failed to render diff");
        }
      } finally {
        if (!disposed) {
          setIsRendering(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [rendererReady, renderer, leftContent, rightContent, language]);

  const hasOutput = Boolean(outputUris.left || outputUris.right);
  const outputClassName = `output-surface${hasOutput ? " has-output" : ""}`;

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
          <label className="field field-small">
            <span className="field-label">Language</span>
            <input
              className="field-control"
              type="text"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="e.g. typescript"
            />
          </label>
        </section>
        <section className="output-section">
          <h2 className="output-heading">Output</h2>
          <div className={outputClassName}>
            {isRendering && (
              <span className="output-status">Rendering diff…</span>
            )}
            {error && !isRendering && (
              <span className="output-status">{error}</span>
            )}
            {!isRendering && !error && hasOutput && (
              <div className="output-gallery">
                {outputUris.left && (
                  <figure className="output-panel">
                    <figcaption className="output-label">Left</figcaption>
                    <img
                      className="output-render"
                      src={outputUris.left}
                      alt="Left code diff preview"
                    />
                  </figure>
                )}
                {outputUris.right && (
                  <figure className="output-panel">
                    <figcaption className="output-label">Right</figcaption>
                    <img
                      className="output-render"
                      src={outputUris.right}
                      alt="Right code diff preview"
                    />
                  </figure>
                )}
              </div>
            )}
            {!isRendering && !error && !hasOutput && (
              <span className="output-status">
                Provide content to render a diff.
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
