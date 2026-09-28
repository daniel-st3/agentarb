import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appAsset = (name: string) =>
  readFileSync(new URL(`../src/app/${name}`, import.meta.url));

describe("Valrun browser identity", () => {
  it("uses a word-free vector mark", () => {
    const svg = appAsset("icon.svg").toString("utf8");
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toMatch(/<path\b/);
    expect(svg).not.toMatch(/<text\b|Valrun|SignalForge/i);
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
