import { ImageResponse } from "next/og";

import { fetchPublicShareSummary } from "../../../lib/share";
import { buildShareCardSummary } from "../../../lib/share-card";

export const alt = "书法练习分享结果卡片";
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const size = { height: 630, width: 1200 };

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let share = null;
  try {
    share = await fetchPublicShareSummary(token);
  } catch {
    // Service failures and revoked shares use the same non-sensitive fallback.
  }
  const summary = buildShareCardSummary(share);

  return new ImageResponse(
    <div
      style={{
        background: "#f3ebdd",
        color: "#241e1a",
        display: "flex",
        height: "100%",
        padding: "70px 76px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "2px solid #c8aa88",
          bottom: 42,
          display: "flex",
          left: 42,
          position: "absolute",
          right: 42,
          top: 42,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "#8c3c2d",
            display: "flex",
            fontSize: 30,
            letterSpacing: 6,
          }}
        >
          CALLIGRAPHY PRACTICE
        </div>
        <div
          style={{
            alignItems: "baseline",
            display: "flex",
            gap: 28,
          }}
        >
          <div
            style={{
              color: summary.active ? "#2e5d43" : "#8c3c2d",
              display: "flex",
              fontSize: 190,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {summary.active ? summary.attemptCount : "—"}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>
              {summary.active ? "ATTEMPTS" : "SHARE UNAVAILABLE"}
            </div>
            <div style={{ color: "#6d645c", display: "flex", fontSize: 25 }}>
              {summary.active
                ? "FIRST  →  LATEST"
                : "REVOKED  ·  EXPIRED  ·  NOT FOUND"}
            </div>
          </div>
        </div>
        <div style={{ color: "#6d645c", display: "flex", fontSize: 24 }}>
          Shared intentionally · Artwork remains private by default
        </div>
      </div>
    </div>,
    size,
  );
}
