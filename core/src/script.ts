import { highlightText } from "./diff.js";
import { ConversionOptions, dmpDiff, SvgCodeRenderer } from "./index.js";

const leftExample =
  "The quick brown fox jumps over the lazy dog.\nfoobarhello\nPack my box with five dozen liquor jugs.\nSphinx of black quartz, judge my vow.";
const rightExample =
  "The quick red fox hopped over a lazy dog.\n\n\nhello\nPack our box with five dozen liquor jugs.";

const result = dmpDiff(leftExample, rightExample);

console.log("Left (removed ranges highlighted):");
console.log(highlightText(leftExample, result.left));
console.log("\nRight (added ranges highlighted):");
console.log(highlightText(rightExample, result.right));

const renderer = SvgCodeRenderer.getInstance();
await renderer.setTheme("Default Dark Modern");
const options: ConversionOptions = {
  imageType: "svg",
  fontFamily: "Monaco",
  fontSize: 14,
  lineHeight: 14,
  dimensions: { width: 800, height: 400 },
};

const resLeft = await renderer.getDataUri(
  leftExample,
  "",
  options,
  result.left
);
console.log("left:\n" + resLeft);
const resRight = await renderer.getDataUri(
  rightExample,
  "",
  options,
  result.right
);
console.log("right:\n" + resRight);
