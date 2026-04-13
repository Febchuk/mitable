import { useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Avatar from "../../components/ui/Avatar";
import ProgressBar from "../../components/ui/ProgressBar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/* ─── Color Data ─── */
const colorGroups = [
  {
    title: "Backgrounds",
    colors: [
      { name: "Base", var: "--bg-base", dark: "#1a1916", light: "#f5f1ed" },
      { name: "Raised", var: "--bg-raised", dark: "#211f1b", light: "#faf8f6" },
      { name: "Overlay", var: "--bg-overlay", dark: "#2a2824", light: "#fdfcfb" },
      { name: "Muted", var: "--bg-muted", dark: "#33312b", light: "#e8e2dc" },
    ],
  },
  {
    title: "Text",
    colors: [
      { name: "Primary", var: "--text-primary", dark: "#ece8e0", light: "#1c2b33" },
      { name: "Secondary", var: "--text-secondary", dark: "#9b9689", light: "#5c6b73" },
      { name: "Tertiary", var: "--text-tertiary", dark: "#6b665c", light: "#8a9199" },
      { name: "Faint", var: "--text-faint", dark: "#4a4640", light: "#b0b7bc" },
    ],
  },
  {
    title: "Accent",
    colors: [
      { name: "Accent", var: "--mi-accent", dark: "#82c0cc", light: "#2a7f8e" },
      { name: "Accent Dark", var: "--mi-accent-dark", dark: "#3a7a87", light: "#16697a" },
      { name: "Accent Light", var: "--mi-accent-light", dark: "#b8dde4", light: "#82c0cc" },
    ],
  },
  {
    title: "Status",
    colors: [
      { name: "Success", var: "--status-success", dark: "#3a9b6b", light: "#2d8659" },
      { name: "Warning", var: "--status-warning", dark: "#d4a27a", light: "#b8854a" },
      { name: "Error", var: "--status-error", dark: "#e87474", light: "#d45555" },
      { name: "Info", var: "--status-info", dark: "#4a9fd9", light: "#3a85b5" },
    ],
  },
];

/* ─── Typography Specimens ─── */
const sansSpecimens = [
  { size: 12, weight: 400, label: "12 / Regular" },
  { size: 13, weight: 400, label: "13 / Regular" },
  { size: 13, weight: 500, label: "13 / Medium" },
  { size: 14, weight: 400, label: "14 / Regular" },
  { size: 14, weight: 500, label: "14 / Medium" },
  { size: 16, weight: 500, label: "16 / Medium" },
  { size: 18, weight: 500, label: "18 / Medium" },
];

const serifSpecimens = [
  { size: 16, weight: 300, label: "16 / Light" },
  { size: 16, weight: 400, label: "16 / Regular" },
  { size: 18, weight: 400, label: "18 / Regular" },
  { size: 24, weight: 300, label: "24 / Light" },
  { size: 24, weight: 400, label: "24 / Regular" },
];

const monoSpecimens = [
  { size: 11, weight: 400, label: "11 / Regular" },
  { size: 12, weight: 400, label: "12 / Regular" },
  { size: 13, weight: 400, label: "13 / Regular" },
];

/* ─── Spacing Scale ─── */
const spacingTokens = [
  { name: "xs", value: 4 },
  { name: "sm", value: 8 },
  { name: "md", value: 16 },
  { name: "lg", value: 24 },
  { name: "xl", value: 32 },
  { name: "2xl", value: 48 },
];

/* ─── Border Radius ─── */
const radiusTokens = [
  { name: "sm", value: "4px" },
  { name: "md", value: "6px" },
  { name: "lg", value: "10px" },
  { name: "xl", value: "12px" },
  { name: "2xl", value: "16px" },
  { name: "full", value: "50%" },
];

/* ─── Transitions ─── */
const transitionTokens = [
  { name: "instant", value: "50ms" },
  { name: "fast", value: "150ms" },
  { name: "normal", value: "250ms" },
  { name: "slow", value: "400ms" },
  { name: "reveal", value: "600ms" },
];

/* ─── Helpers ─── */

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        borderBottom: "var(--border-hairline)",
        paddingBottom: 16,
        marginBottom: 4,
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          fontWeight: 400,
          color: "var(--text-primary)",
          margin: 0,
          letterSpacing: "-0.2px",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-tertiary)",
          margin: "6px 0 0",
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <h4
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        color: "var(--text-tertiary)",
        margin: "0 0 12px",
      }}
    >
      {children}
    </h4>
  );
}

function TokenLabel({ children }: { children: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </span>
  );
}

/* ─── Main Component ─── */

export default function DesignSpecTab() {
  const [switchA, setSwitchA] = useState(false);
  const [switchB, setSwitchB] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* ═══════ Section 1: Color Palette ═══════ */}
      <div>
        <SectionHeader
          title="Color Palette"
          subtitle="Live swatches reflect the active theme. Hex values shown for both modes."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {colorGroups.map((group) => (
            <div key={group.title}>
              <SubHeading>{group.title}</SubHeading>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(group.colors.length, 4)}, 1fr)`,
                  gap: 16,
                }}
              >
                {group.colors.map((color) => (
                  <div
                    key={color.var}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Swatch */}
                    <div
                      style={{
                        width: "100%",
                        height: 56,
                        borderRadius: 8,
                        background: `var(${color.var})`,
                        border: "0.5px solid rgba(var(--ui-rgb), 0.1)",
                      }}
                    />
                    {/* Label */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {color.name}
                      </span>
                      <TokenLabel>{color.var}</TokenLabel>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          marginTop: 2,
                        }}
                      >
                        <span style={{ color: "var(--text-faint)" }}>D {color.dark}</span>
                        <span style={{ color: "var(--text-faint)" }}>L {color.light}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ Section 2: Typography ═══════ */}
      <div>
        <SectionHeader
          title="Typography"
          subtitle="Three font families — Inter for UI, Newsreader for editorial headings, JetBrains Mono for code."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Inter */}
          <div>
            <SubHeading>Inter (Sans)</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sansSpecimens.map((spec) => (
                <div
                  key={spec.label}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 20,
                    padding: "6px 0",
                  }}
                >
                  <span
                    style={{
                      width: 110,
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-faint)",
                    }}
                  >
                    {spec.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: spec.size,
                      fontWeight: spec.weight,
                      color: "var(--text-primary)",
                    }}
                  >
                    The quick brown fox jumps over the lazy dog
                  </span>
                </div>
              ))}
              {/* Uppercase label specimen */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 20,
                  padding: "6px 0",
                }}
              >
                <span
                  style={{
                    width: 110,
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-faint)",
                  }}
                >
                  10 / Label
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                  }}
                >
                  Uppercase label style
                </span>
              </div>
            </div>
          </div>

          {/* Newsreader */}
          <div>
            <SubHeading>Newsreader (Serif)</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {serifSpecimens.map((spec) => (
                <div
                  key={spec.label}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 20,
                    padding: "6px 0",
                  }}
                >
                  <span
                    style={{
                      width: 110,
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-faint)",
                    }}
                  >
                    {spec.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: spec.size,
                      fontWeight: spec.weight,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.2px",
                    }}
                  >
                    The quick brown fox jumps over the lazy dog
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* JetBrains Mono */}
          <div>
            <SubHeading>JetBrains Mono</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {monoSpecimens.map((spec) => (
                <div
                  key={spec.label}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 20,
                    padding: "6px 0",
                  }}
                >
                  <span
                    style={{
                      width: 110,
                      flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-faint)",
                    }}
                  >
                    {spec.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: spec.size,
                      fontWeight: spec.weight,
                      color: "var(--text-primary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {"const x = 42; // tabular-nums 0123456789"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ Section 3: Spacing Scale ═══════ */}
      <div>
        <SectionHeader
          title="Spacing Scale"
          subtitle="Consistent spacing tokens used across all components and layouts."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {spacingTokens.map((token) => (
            <div
              key={token.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span
                style={{
                  width: 48,
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                {token.name}
              </span>
              <div
                style={{
                  width: token.value,
                  height: 24,
                  borderRadius: 4,
                  background: "var(--mi-accent)",
                  opacity: 0.3,
                  transition: "opacity 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "0.3";
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {token.value}px
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ Section 4: Border Radius ═══════ */}
      <div>
        <SectionHeader
          title="Border Radius"
          subtitle="Radius tokens from subtle rounding to full circles."
        />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {radiusTokens.map((token) => (
            <div
              key={token.name}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: token.value,
                  background: "var(--bg-overlay)",
                  border: "0.5px solid rgba(var(--ui-rgb), 0.1)",
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  {token.name}
                </span>
                <TokenLabel>{token.value}</TokenLabel>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ Section 5: Transitions ═══════ */}
      <div>
        <SectionHeader
          title="Transitions"
          subtitle="Hover over each bar to see the timing in action."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {transitionTokens.map((token) => (
            <div
              key={token.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span
                style={{
                  width: 64,
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                {token.name}
              </span>
              <div
                style={{
                  width: 120,
                  height: 28,
                  borderRadius: 6,
                  background: "rgba(var(--mi-accent-rgb), 0.15)",
                  position: "relative",
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  const inner = e.currentTarget.querySelector("[data-fill]") as HTMLElement;
                  if (inner) inner.style.transform = "scaleX(1)";
                }}
                onMouseLeave={(e) => {
                  const inner = e.currentTarget.querySelector("[data-fill]") as HTMLElement;
                  if (inner) inner.style.transform = "scaleX(0)";
                }}
              >
                <div
                  data-fill=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "var(--mi-accent)",
                    opacity: 0.4,
                    transformOrigin: "left",
                    transform: "scaleX(0)",
                    transition: `transform ${token.value} ease`,
                    borderRadius: 6,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {token.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ Section 6: Component Gallery ═══════ */}
      <div>
        <SectionHeader
          title="Component Gallery"
          subtitle="Live instances of core UI components in all their variants and states."
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {/* ── Buttons ── */}
          <div>
            <SubHeading>Button</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Variants */}
              <div>
                <TokenLabel>Variants</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="text">Text</Button>
                </div>
              </div>
              {/* Sizes */}
              <div>
                <TokenLabel>Sizes</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </div>
              {/* Disabled */}
              <div>
                <TokenLabel>Disabled</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Button variant="primary" disabled>
                    Disabled
                  </Button>
                  <Button variant="secondary" disabled>
                    Disabled
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Cards ── */}
          <div>
            <SubHeading>Card</SubHeading>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              <Card variant="default" padding="md">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    Default
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    bg-canvas-raised
                  </span>
                </div>
              </Card>
              <Card variant="elevated" padding="md">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    Elevated
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    bg-canvas-overlay
                  </span>
                </div>
              </Card>
              <Card variant="accent" padding="md">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    Accent
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>bg-indigo/5</span>
                </div>
              </Card>
            </div>
            {/* Hover card */}
            <div style={{ marginTop: 12 }}>
              <TokenLabel>With hover</TokenLabel>
              <div style={{ marginTop: 8, maxWidth: 240 }}>
                <Card variant="default" padding="md" hover>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Hover me
                  </span>
                </Card>
              </div>
            </div>
          </div>

          {/* ── Badges ── */}
          <div>
            <SubHeading>Badge</SubHeading>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </div>
          </div>

          {/* ── Avatars ── */}
          <div>
            <SubHeading>Avatar</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Sizes */}
              <div>
                <TokenLabel>Sizes</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Avatar name="Jane Doe" size="sm" />
                  <Avatar name="Jane Doe" size="md" />
                  <Avatar name="Jane Doe" size="lg" />
                </div>
              </div>
              {/* Status */}
              <div>
                <TokenLabel>Online status</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Avatar name="Alice Kim" size="md" online={true} />
                  <Avatar name="Bob Chen" size="md" online={false} />
                </div>
              </div>
            </div>
          </div>

          {/* ── ProgressBar ── */}
          <div>
            <SubHeading>Progress Bar</SubHeading>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                maxWidth: 400,
              }}
            >
              <div>
                <TokenLabel>Heights &amp; percentages</TokenLabel>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <ProgressBar percentage={25} height="sm" />
                  <ProgressBar percentage={50} height="md" />
                  <ProgressBar percentage={75} height="lg" />
                </div>
              </div>
              <div>
                <TokenLabel>With label</TokenLabel>
                <div style={{ marginTop: 8 }}>
                  <ProgressBar percentage={68} height="md" showLabel />
                </div>
              </div>
            </div>
          </div>

          {/* ── Switch ── */}
          <div>
            <SubHeading>Switch</SubHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Switch checked={switchA} onCheckedChange={setSwitchA} id="demo-switch-a" />
                <Label
                  htmlFor="demo-switch-a"
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Unchecked
                </Label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Switch checked={switchB} onCheckedChange={setSwitchB} id="demo-switch-b" />
                <Label
                  htmlFor="demo-switch-b"
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Checked
                </Label>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Switch disabled id="demo-switch-disabled" />
                <Label
                  htmlFor="demo-switch-disabled"
                  style={{
                    fontSize: 13,
                    color: "var(--text-faint)",
                  }}
                >
                  Disabled
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
