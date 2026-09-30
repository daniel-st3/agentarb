import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appAsset = (name: string) =>
  readFileSync(new URL(`../src/app/${name}`, import.meta.url));

describe("Valrun browser identity", () => {
  it("preserves the supplied app icon at the existing SVG compatibility URL", () => {
    const svg = appAsset("icon.svg").toString("utf8");
    expect(svg).toContain('viewBox="0 0 420 420"');
    const source = readFileSync(new URL("../public/brand/valrun-app-icon.png", import.meta.url));
    expect(svg).toContain(`data:image/png;base64,${source.toString("base64")}`);
    expect(svg).not.toMatch(/<text\b|Valrun|SignalForge/i);
  });

  it("provides normal and high-DPI favicon sizes", () => {
    const ico = appAsset("favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
  });

  it("keeps the horizontal source crop at its original aspect ratio", () => {
    const png = readFileSync(new URL("../public/brand/valrun-logo.png", import.meta.url));
    expect(png.readUInt32BE(16)).toBe(952);
    expect(png.readUInt32BE(20)).toBe(204);
    expect(JSON.parse(appAsset("brand-logo-data.json").toString())).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });

  it.each([
    ["icon.png", 32],
    ["apple-icon.png", 180],
  ])("keeps %s at its intended size", (name, size) => {
    const png = appAsset(name);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });
});
