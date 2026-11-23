import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../src/styles.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

function token(name: string): [number, number, number] {
  const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(root);
  if (!m) throw new Error(`token ${name} missing`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/** Relative luminance of an oklch colour via OKLab → linear sRGB. */
function luminance([L, C, h]: [number, number, number]): number {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const r = c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const ratio = (x: string, y: string) => { const [a, b] = [luminance(token(x)), luminance(token(y))].sort((p, q) => q - p) as [number, number]; return (a + 0.05) / (b + 0.05); };

describe("WCAG AA contrast of theme tokens", () => {
  it.each([
    ["foreground", "background"], ["foreground", "card"], ["muted-foreground", "background"], ["muted-foreground", "card"],
    ["muted-foreground", "muted"], ["primary-foreground", "primary"], ["secondary-foreground", "secondary"],
    ["accent-foreground", "accent"], ["destructive", "card"], ["primary-foreground", "sev-good"],
    ["primary-foreground", "sev-moderate"], ["primary-foreground", "sev-poor"], ["primary-foreground", "sev-severe"], ["primary-foreground", "sev-unknown"],
  ])("%s on %s ≥ 4.5:1", (fg, bg) => { expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5); });
  it.each([["input", "card"], ["ring", "background"]])("%s vs %s ≥ 3:1", (a, b) => { expect(ratio(a, b)).toBeGreaterThanOrEqual(3); });
});
