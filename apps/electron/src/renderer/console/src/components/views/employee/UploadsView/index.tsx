import { Download } from "lucide-react";

export default function UploadsView() {
  return (
    <div className="app-no-drag">
      <div>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 32,
            color: "#ECE8E0",
            fontWeight: 400,
            letterSpacing: "-0.4px",
            lineHeight: 1,
            margin: 0,
          }}
        >
          Uploads
        </h1>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 15,
            color: "#6B665C",
            fontWeight: 400,
            fontStyle: "italic",
            marginTop: 6,
          }}
        >
          Manage your uploaded files
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 0",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "#2A2824",
            border: "0.5px solid rgba(236, 232, 224, 0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Download size={22} style={{ color: "#6B665C" }} />
        </div>
        <p style={{ color: "#ECE8E0", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Coming Soon
        </p>
        <p
          style={{
            color: "#6B665C",
            fontSize: 12,
            maxWidth: 280,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Upload and manage documents for your AI agent to reference.
        </p>
      </div>
    </div>
  );
}
