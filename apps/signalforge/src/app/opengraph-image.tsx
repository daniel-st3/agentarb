import { ImageResponse } from "next/og";

export const alt = "Valrun — check the economics before an AI agent spends.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Static brand content only: no request, objective or account data in social images. */
export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 64, background: "#101113", color: "#f4f0e8", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="64" height="64" viewBox="0 0 64 64"><path d="M10 18 29 46 53 15" fill="none" stroke="#f4f0e8" strokeWidth="8" /><path d="M36 48h18" stroke="#ff7456" strokeWidth="8" /></svg>
        <span style={{ fontSize: 38 }}>Valrun.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 76, lineHeight: 1.05, maxWidth: 1000 }}>Know if an AI task is worth running.</div>
        <div style={{ fontSize: 25, color: "#abb1b5" }}>Evidence + explicit assumptions → decision + receipt.</div>
      </div>
      <div style={{ display: "flex", borderTop: "1px solid #41454a", paddingTop: 24, color: "#ff987e", fontSize: 21 }}>Deterministic underwriting · REST / MCP · Guest-first</div>
    </div>, size,
  );
}
