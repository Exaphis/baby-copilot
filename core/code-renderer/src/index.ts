// Extracted from baby-copilot-vscode/src/codeRenderer.ts

import {
  BundledLanguage,
  BundledTheme,
  getSingletonHighlighter,
  Highlighter,
} from "shiki";
import { diff_match_patch, Diff } from "diff-match-patch";

export type DiffType = "added" | "removed";

export interface DiffLine {
  lineNumber: number;
  type: DiffType;
}

export interface Position {
  line: number;
  character: number;
}

export interface DiffRange {
  start: Position;
  end: Position;
  type: DiffType;
}

export function escapeForSVG(text: string): string {
  return text
    .replace(/&/g, "&amp;") // must be first
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function kebabOfStr(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2") // handle camelCase and PascalCase
    .replace(/[\s_]+/g, "-") // replace spaces and underscores with hyphens
    .toLowerCase();
}

interface HTMLOptions {
  theme?: string;
  customCSS?: string;
  containerClass?: string;
}

interface ConversionOptions extends HTMLOptions {
  transparent?: boolean;
  imageType: "svg";
  fontSize: number;
  fontFamily: string;
  dimensions: Dimensions;
  lineHeight: number;
}

interface Dimensions {
  width: number;
  height: number;
}

type DataUri = PngUri | SvgUri;
type PngUri = string;
type SvgUri = string;

export class CodeRenderer {
  private static instance: CodeRenderer;
  private currentTheme: string = "dark-plus";
  private editorBackground: string = "#000000";
  private highlighter: Highlighter | null = null;

  private constructor() {}

  static getInstance(): CodeRenderer {
    if (!CodeRenderer.instance) {
      CodeRenderer.instance = new CodeRenderer();
    }
    return CodeRenderer.instance;
  }

  public async setTheme(themeName: string): Promise<void> {
    if (
      this.themeExists(kebabOfStr(themeName)) ||
      themeName === "Default Dark Modern"
    ) {
      this.currentTheme =
        themeName === "Default Dark Modern"
          ? "dark-plus"
          : kebabOfStr(themeName);

      this.highlighter = await getSingletonHighlighter({
        langs: ["typescript"],
        themes: [this.currentTheme],
      });

      const th = this.highlighter.getTheme(this.currentTheme);

      this.editorBackground = th.bg;
    } else {
      this.currentTheme = "dark-plus";
    }
  }

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  themeExists(themeNameKebab: string): themeNameKebab is BundledTheme {
    const themeArray: BundledTheme[] = [
      "andromeeda",
      "aurora-x",
      "ayu-dark",
      "catppuccin-frappe",
      "catppuccin-latte",
      "catppuccin-macchiato",
      "catppuccin-mocha",
      "dark-plus",
      "dracula",
      "dracula-soft",
      "everforest-dark",
      "everforest-light",
      "github-dark",
      "github-dark-default",
      "github-dark-dimmed",
      "github-dark-high-contrast",
      "github-light",
      "github-light-default",
      "github-light-high-contrast",
      "gruvbox-dark-hard",
      "gruvbox-dark-medium",
      "gruvbox-dark-soft",
      "gruvbox-light-hard",
      "gruvbox-light-medium",
      "gruvbox-light-soft",
      "houston",
      "kanagawa-dragon",
      "kanagawa-lotus",
      "kanagawa-wave",
      "laserwave",
      "light-plus",
      "material-theme",
      "material-theme-darker",
      "material-theme-lighter",
      "material-theme-ocean",
      "material-theme-palenight",
      "min-dark",
      "min-light",
      "monokai",
      "night-owl",
      "nord",
      "one-dark-pro",
      "one-light",
      "plastic",
      "poimandres",
      "red",
      "rose-pine",
      "rose-pine-dawn",
      "rose-pine-moon",
      "slack-dark",
      "slack-ochin",
      "snazzy-light",
      "solarized-dark",
      "solarized-light",
      "synthwave-84",
      "tokyo-night",
      "vesper",
      "vitesse-black",
      "vitesse-dark",
      "vitesse-light",
    ];

    return themeArray.includes(themeNameKebab as BundledTheme);
  }

  async highlightCode(
    code: string,
    language: string = "javascript",
    diffLines: DiffLine[] = [],
    diffRanges: DiffRange[] = []
  ): Promise<string> {
    await this.highlighter!.loadLanguage(language as BundledLanguage);

    const addedLines = diffLines
      .filter((line) => line.type === "added")
      .map((line) => line.lineNumber);
    const deletedLines = diffLines
      .filter((line) => line.type === "removed")
      .map((line) => line.lineNumber);

    const decorations = [] as any[];
    for (const diffRange of diffRanges) {
      for (const className of ["diff", diffRange.type]) {
        decorations.push({
          start: diffRange.start,
          end: diffRange.end,
          properties: { class: className },
        });
      }
    }

    return this.highlighter!.codeToHtml(code, {
      lang: language,
      theme: this.currentTheme,
      decorations,
      transformers: [
        {
          line(hast: any, line: number) {
            // subtract 1 as the passed line is 1-based
            if (addedLines.includes(line - 1)) {
              this.addClassToHast(hast, "diff");
              this.addClassToHast(hast, "added");
            } else if (deletedLines.includes(line - 1)) {
              this.addClassToHast(hast, "diff");
              this.addClassToHast(hast, "removed");
            }
          },
        } as any,
      ],
    });
  }

  async convertToSVG(
    code: string,
    language: string = "javascript",
    options: ConversionOptions,
    diffLines: DiffLine[] = [],
    diffRanges: DiffRange[] = []
  ): Promise<Buffer> {
    // Determine width based on longest line length.
    // We do this instead of using overflow: hidden because for unknown reasons
    // it cuts off long lines at the start instead of at the end sometimes?
    // e.g., a long comment will get cut off completely
    const TAB_SIZE = 4;
    const lines = code.split(/\r\n|\r|\n/);
    const maxLineCount = lines.reduce((max, l) => {
      const visual = l.replace(/\t/g, " ".repeat(TAB_SIZE));
      return Math.max(max, visual.length);
    }, 0);

    // fontSize is not the width, but should be safe because it is larger
    const maxWidthPx = Math.max(
      options.dimensions.width,
      maxLineCount * options.fontSize
    );

    const highlightedCodeHtml = await this.highlightCode(
      code,
      language,
      diffLines,
      diffRanges
    );

    const svg = `\
    <svg xmlns="http://www.w3.org/2000/svg" width="${
      options.dimensions.width
    }" height="${options.dimensions.height + 1}" shape-rendering="crispEdges">
      <foreignObject x="0" y="1" width="${maxWidthPx}" height="${
      options.dimensions.height + 1
    }">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>
            .wuke-code-svg {
              * {
                all: unset;
                font-family: ${options.fontFamily};
                font-size: ${options.fontSize}px;
                vertical-align: middle;
              }

              .line {
                display: block;
                line-height: ${options.lineHeight - 0.25}px;
                height: ${options.lineHeight}px;

                span {
                  display: inline-block;
                  vertical-align: middle;
                  white-space: pre;
                }
                span.diff.added {
                  background-color: rgba(0, 255, 0, 0.2);
                }
                span.diff.removed {
                  background-color: rgba(255, 0, 0, 0.2);
                }
              }

              .line.diff.removed {
                background-color: rgba(255, 0, 0, 0.2);
              }
              .line.diff.added {
                background-color: rgba(0, 255, 0, 0.2);
              }
            }
          </style>
          <div class="wuke-code-svg" style="width: ${maxWidthPx}px; height: ${
      options.dimensions.height
    }px; background-color: ${
      this.editorBackground
    }; box-shadow:0 0 0 1px #ffffff30 inset;">
          ${highlightedCodeHtml}
          </div>
        </div>
      </foreignObject>
    </svg>`;
    return Buffer.from(svg, "utf8");
  }

  async getDataUri(
    code: string,
    language: string = "javascript",
    options: ConversionOptions,
    diffLines: DiffLine[] = [],
    diffRanges: DiffRange[] = []
  ): Promise<DataUri> {
    switch (options.imageType) {
      case "svg":
        const svgBuffer = await this.convertToSVG(
          code,
          language,
          options,
          diffLines,
          diffRanges
        );
        return `data:image/svg+xml;base64,${svgBuffer.toString("base64")}`;
    }
  }

  // Utilities for diff rendering
  public computeDiff(
    left: string,
    right: string
  ): {
    content: string;
    diffRanges: DiffRange[];
  } {
    const differ = new diff_match_patch();
    const diffResult: Diff[] = differ.diff_main(left, right);
    differ.diff_cleanupSemantic(diffResult);

    const content = diffResult.map((d) => d[1]).join("");

    const diffRanges: DiffRange[] = [];
    let line = 0;
    let char = 0;
    for (const diff of diffResult) {
      const linesArr = diff[1].split(/\r\n|\r|\n/);
      const lastLine = linesArr[linesArr.length - 1];
      const newLine = line + linesArr.length - 1;
      const newChar = lastLine.length + (linesArr.length === 1 ? char : 0);

      if (diff[0] !== 0) {
        const diffType: DiffType = diff[0] === 1 ? "added" : "removed";
        diffRanges.push({
          start: { line, character: char },
          end: { line: newLine, character: newChar },
          type: diffType,
        });
      }

      line = newLine;
      char = newChar;
    }

    return { content, diffRanges };
  }

  public async getDiffDataUri(
    left: string,
    right: string,
    language: string,
    options: ConversionOptions
  ): Promise<DataUri> {
    const { content, diffRanges } = this.computeDiff(left, right);
    return this.getDataUri(content, language, options, [], diffRanges);
  }
}
