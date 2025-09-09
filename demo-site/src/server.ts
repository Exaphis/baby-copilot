import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
import { CodeRenderer } from "@baby-copilot/code-renderer";

const PORT = Number(process.env.PORT || 3000);
const app = express();

// Simple in-memory list of SSE clients
const clients: Set<Response> = new Set();

// Multiple demo panes
const demosDir = path.resolve(process.cwd(), "demos");
fs.mkdirSync(demosDir, { recursive: true });

type Demo = {
  name: string;
  title: string;
  language: string;
  before: string;
  after: string;
};

const demos: Demo[] = [
  {
    name: "greet",
    title: "Greet Function Update",
    language: "typescript",
    before: path.join(demosDir, "greet", "before.ts"),
    after: path.join(demosDir, "greet", "after.ts"),
  },
  {
    name: "algorithm",
    title: "Algorithm Refactor",
    language: "typescript",
    before: path.join(demosDir, "algorithm", "before.ts"),
    after: path.join(demosDir, "algorithm", "after.ts"),
  },
  {
    name: "config",
    title: "Config Change",
    language: "typescript",
    before: path.join(demosDir, "config", "before.txt"),
    after: path.join(demosDir, "config", "after.txt"),
  },
];

// Render endpoint: generates SVG on each request
app.get("/diff.svg", async (req: Request, res: Response) => {
  try {
    const name = String((req.query.name as string) || "greet");
    const demo = demos.find((d) => d.name === name) || demos[0];
    const left = fs.readFileSync(demo.before, "utf8");
    const right = fs.readFileSync(demo.after, "utf8");
    const fontSize = 14;
    const lineHeight = Math.round(fontSize * 1.5);
    const { content } = CodeRenderer.getInstance().computeDiff(left, right);
    const lines = content.split(/\r\n|\r|\n/).length;
    const dimensions = {
      width: 800,
      height: Math.max(lineHeight, lines * lineHeight),
    };
    const fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

    const cr = CodeRenderer.getInstance();
    await cr.setTheme("dark-plus");
    const dataUri = await cr.getDiffDataUri(left, right, demo.language, {
      imageType: "svg",
      fontFamily,
      fontSize,
      lineHeight,
      dimensions,
    });

    const b64 = dataUri.replace(/^data:image\/svg\+xml;base64,/, "");
    const svgBuffer = Buffer.from(b64, "base64");
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svgBuffer);
  } catch (err: any) {
    res.status(500).send(String(err?.stack || err));
  }
});

// Index page: embeds multiple diff SVGs and uses SSE for live reload
app.get("/", (_req: Request, res: Response) => {
  const cards = demos
    .map((d) => {
      const beforeRel = path.relative(process.cwd(), d.before);
      const afterRel = path.relative(process.cwd(), d.after);
      return `
        <section class="card">
          <header><h2>${d.title}</h2><small>${d.name}</small></header>
          <p>Edit <code>${beforeRel}</code> and <code>${afterRel}</code></p>
          <img class="preview" data-name="${d.name}" alt="${
        d.title
      }" src="/diff.svg?name=${d.name}&ts=${Date.now()}" />
        </section>
      `;
    })
    .join("\n");

  const html = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Baby Copilot — Demo Site</title>
      <style>
        :root { --bg: #0f1117; --fg: #e5e7eb; --muted: #9aa4b2; --card: #111318; --border: #2a2f3a; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif; padding: 2rem; background: var(--bg); color: var(--fg); }
        main { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr; gap: 16px; }
        img { display: block; max-width: 100%; height: auto; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
        h1 { font-size: 1.5rem; margin: 0 0 1rem; grid-column: 1 / -1; }
        h2 { font-size: 1rem; margin: 0 0 .5rem; }
        header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        p  { color: var(--muted); margin: .25rem 0 1rem; }
        code { background: #0b0d12; padding: 0.1rem 0.3rem; border-radius: 4px; }
      </style>
    </head>
    <body>
      <main>
        <h1>Baby Copilot — Code Renderer Diff Demo</h1>
        ${cards}
      </main>
      <script>
        const evtSource = new EventSource('/events');
        evtSource.addEventListener('reload', (ev) => {
          try {
            const data = JSON.parse(ev.data || '{}');
            const imgs = document.querySelectorAll('img.preview');
            imgs.forEach(img => {
              if (!data.name || img.dataset.name === data.name) {
                const url = new URL(img.src, window.location.origin);
                url.searchParams.set('ts', Date.now());
                img.src = url.toString();
              }
            });
          } catch (e) {
            console.error('reload parse error', e);
          }
        });
      </script>
    </body>
  </html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// SSE endpoint for live reload
app.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Initial comment to establish stream
  res.write(": connected\n\n");
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
});

// Watch demo files for changes and notify clients
const watchPaths = demos.flatMap((d) => [d.before, d.after]);
const watcher = chokidar.watch(watchPaths, { ignoreInitial: true });
watcher.on("all", (_event, filePath) => {
  const demo = demos.find(
    (d) =>
      filePath.startsWith(path.dirname(d.before)) ||
      filePath.startsWith(path.dirname(d.after))
  );
  const payload = JSON.stringify({ name: demo?.name });
  for (const res of clients) {
    res.write("event: reload\n");
    res.write(`data: ${payload}\n\n`);
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Demo server running: http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  for (const d of demos) {
    console.log(
      `- ${d.name}: ${path.relative(process.cwd(), d.before)} | ${path.relative(
        process.cwd(),
        d.after
      )}`
    );
  }
});
