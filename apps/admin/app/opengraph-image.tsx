import { ImageResponse } from "next/og";

export const alt = "Staffly Admin dashboard preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const statCards = [
  { label: "Total employees", value: "248", accent: "#2563eb" },
  { label: "Present today", value: "219", accent: "#16a34a" },
  { label: "Pending approvals", value: "18", accent: "#f59e0b" },
  { label: "Announcements", value: "12", accent: "#db2777" },
];

const activities = [
  ["Upcoming holidays", "Founders Day", "Jul 08"],
  ["Recent announcements", "Quarterly town hall", "High"],
  ["New hires", "Aarav Mehta", "EMP-248"],
];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "Inter, Arial, sans-serif",
        padding: 56,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          border: "1px solid #dbe3ef",
          borderRadius: 28,
          background: "#ffffff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "36px 44px 26px",
            borderBottom: "1px solid #e5edf7",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                color: "#64748b",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              Staffly Admin
            </div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 800 }}>
              Dashboard
            </div>
            <div style={{ display: "flex", color: "#475569", fontSize: 26 }}>
              Snapshot of your organization
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "#0f172a",
              color: "#ffffff",
              fontSize: 42,
              fontWeight: 800,
            }}
          >
            S
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            padding: 36,
          }}
        >
          <div style={{ display: "flex", gap: 18 }}>
            {statCards.map((card) => (
              <div
                key={card.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  width: 258,
                  height: 142,
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  background: "#ffffff",
                  padding: 22,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 34,
                    height: 8,
                    borderRadius: 999,
                    background: card.accent,
                  }}
                />
                <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
                  {card.value}
                </div>
                <div
                  style={{ display: "flex", color: "#64748b", fontSize: 20 }}
                >
                  {card.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 18 }}>
            {activities.map(([title, name, meta]) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 348,
                  height: 168,
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  background: "#f8fafc",
                  padding: 24,
                  gap: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    color: "#475569",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 18,
                  }}
                >
                  <div
                    style={{ display: "flex", fontSize: 26, fontWeight: 800 }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 999,
                      background: "#e2e8f0",
                      color: "#334155",
                      padding: "8px 14px",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {meta}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    height: 10,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg, #2563eb 0%, #16a34a 48%, #f59e0b 100%)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
