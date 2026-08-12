import * as React from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   MATERIAL ILLUSTRATION

   Renders an SVG illustration based on the material category name.
   Adapted from nirman-os's ProductImage — but keyed by category name
   (e.g. "Cement", "Steel", "Bricks") rather than a fixed enum, since
   nirman-inventory uses free-form MaterialCategory names.

   The illustrations are professional vector art: cement bags, steel rebar
   bundles, brick walls, paint cans, tile stacks, pipes, AAC blocks, and
   a generic box fallback. Each picks a color palette based on the category.
   ═══════════════════════════════════════════════════════════════════════════ */

interface MaterialIllustrationProps {
  categoryName: string;
  materialName?: string;
  className?: string;
}

// Category-specific color palettes
const CATEGORY_COLORS: Record<string, { bg: string; primary: string; accent: string }> = {
  CEMENT: { bg: "#f4f0e8", primary: "#1a3a5c", accent: "#e8b820" },
  STEEL: { bg: "#f5f5f5", primary: "#1c3d5a", accent: "#c4954a" },
  CONCRETE: { bg: "#f0f0f0", primary: "#555555", accent: "#888888" },
  BRICK: { bg: "#f5ede5", primary: "#7c3a1e", accent: "#c47a4a" },
  BRICKS: { bg: "#f5ede5", primary: "#7c3a1e", accent: "#c47a4a" },
  AAC: { bg: "#f5f0e8", primary: "#6b5b3e", accent: "#d4a860" },
  BLOCK: { bg: "#f5f0e8", primary: "#6b5b3e", accent: "#d4a860" },
  BLOCKS: { bg: "#f5f0e8", primary: "#6b5b3e", accent: "#d4a860" },
  PAINT: { bg: "#fff5f5", primary: "#c41e3a", accent: "#ff6b6b" },
  TILES: { bg: "#f8f4ff", primary: "#4a2c6d", accent: "#a78bfa" },
  TILE: { bg: "#f8f4ff", primary: "#4a2c6d", accent: "#a78bfa" },
  PLUMBING: { bg: "#f0fff4", primary: "#1a6b3c", accent: "#4ade80" },
  PIPE: { bg: "#f0fff4", primary: "#1a6b3c", accent: "#4ade80" },
  PIPES: { bg: "#f0fff4", primary: "#1a6b3c", accent: "#4ade80" },
  SAND: { bg: "#faf5ed", primary: "#c4a35a", accent: "#e0c878" },
  AGGREGATE: { bg: "#f0f0f0", primary: "#666666", accent: "#999999" },
  WOOD: { bg: "#f5efe5", primary: "#8b5e3c", accent: "#c49a6c" },
  TIMBER: { bg: "#f5efe5", primary: "#8b5e3c", accent: "#c49a6c" },
  ELECTRICAL: { bg: "#fff8ed", primary: "#b87333", accent: "#ffa500" },
  HARDWARE: { bg: "#f5f5f5", primary: "#444444", accent: "#777777" },
  FASTENERS: { bg: "#f5f5f5", primary: "#444444", accent: "#777777" },
  SAFETY: { bg: "#fff5f5", primary: "#cc3300", accent: "#ff6633" },
  SCAFFOLDING: { bg: "#f5f5f0", primary: "#4a4a4a", accent: "#888888" },
};

function resolveCategory(name: string): string {
  const upper = name.toUpperCase();
  // Check exact match first
  if (CATEGORY_COLORS[upper]) return upper;
  // Check partial matches
  if (upper.includes("CEMENT")) return "CEMENT";
  if (upper.includes("STEEL") || upper.includes("REBAR") || upper.includes("TMT")) return "STEEL";
  if (upper.includes("CONCRETE") || upper.includes("RMC")) return "CONCRETE";
  if (upper.includes("AAC") || upper.includes("BLOCK")) return "AAC";
  if (upper.includes("BRICK")) return "BRICKS";
  if (upper.includes("PAINT") || upper.includes("COATING")) return "PAINT";
  if (upper.includes("TILE")) return "TILES";
  if (upper.includes("PIPE") || upper.includes("PLUMBING") || upper.includes("PVC")) return "PIPE";
  if (upper.includes("SAND")) return "SAND";
  if (upper.includes("AGGREGATE") || upper.includes("GRAVEL") || upper.includes("STONE")) return "AGGREGATE";
  if (upper.includes("WOOD") || upper.includes("TIMBER") || upper.includes("PLY")) return "WOOD";
  if (upper.includes("ELECTRICAL") || upper.includes("WIRE") || upper.includes("CABLE")) return "ELECTRICAL";
  if (upper.includes("HARDWARE") || upper.includes("FASTENER") || upper.includes("BOLT") || upper.includes("NAIL")) return "HARDWARE";
  if (upper.includes("SAFETY") || upper.includes("PPE")) return "SAFETY";
  if (upper.includes("SCAFFOLD")) return "SCAFFOLDING";
  return "GENERIC";
}

export function MaterialIllustration({
  categoryName,
  materialName,
  className = "",
}: MaterialIllustrationProps) {
  const cat = resolveCategory(categoryName);
  const colors = CATEGORY_COLORS[cat] ?? { bg: "#f5f5f5", primary: "#333", accent: "#666" };
  const label = (materialName ?? categoryName).slice(0, 10).toUpperCase();
  const W = 120;

  const common = {
    width: "100%",
    height: "100%",
    viewBox: `0 0 ${W} ${W}`,
    className,
    preserveAspectRatio: "xMidYMid meet" as const,
  };

  switch (cat) {
    case "CEMENT":
      return <CementBagSVG {...common} colors={colors} label={label} W={W} />;
    case "STEEL":
      return <SteelRebarSVG {...common} colors={colors} label={label} W={W} />;
    case "BRICKS":
      return <BrickWallSVG {...common} colors={colors} W={W} />;
    case "AAC":
    case "BLOCK":
      return <AacBlockSVG {...common} colors={colors} W={W} />;
    case "PAINT":
      return <PaintCanSVG {...common} colors={colors} label={label} W={W} />;
    case "TILES":
      return <TileStackSVG {...common} colors={colors} W={W} />;
    case "PIPE":
    case "PLUMBING":
      return <PipeSVG {...common} colors={colors} W={W} />;
    case "SAND":
      return <SandPileSVG {...common} colors={colors} W={W} />;
    case "AGGREGATE":
      return <AggregateSVG {...common} colors={colors} W={W} />;
    case "WOOD":
    case "TIMBER":
      return <TimberSVG {...common} colors={colors} label={label} W={W} />;
    case "ELECTRICAL":
      return <CableSVG {...common} colors={colors} label={label} W={W} />;
    case "SAFETY":
      return <SafetySVG {...common} colors={colors} W={W} />;
    case "SCAFFOLDING":
      return <ScaffoldSVG {...common} colors={colors} W={W} />;
    default:
      return <GenericBoxSVG {...common} colors={colors} label={label} W={W} />;
  }
}

type SVGProps = React.SVGProps<SVGSVGElement> & {
  colors: { bg: string; primary: string; accent: string };
  label: string;
  W: number;
};

// ─── Cement bag ─────────────────────────────────────────────────────────────
function CementBagSVG({ colors, label, W, ...props }: SVGProps) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="28%" ry="4%" fill="rgba(0,0,0,0.12)" />
      <rect x="28%" y="18%" width="44%" height="68%" rx="3%" fill={colors.primary} />
      <path d={`M${0.28*W} ${0.18*W} Q${0.50*W} ${0.12*W} ${0.72*W} ${0.18*W} L${0.72*W} ${0.22*W} L${0.28*W} ${0.22*W} Z`} fill={colors.accent} opacity="0.8" />
      <rect x="33%" y="32%" width="34%" height="14%" rx="2%" fill="white" opacity="0.95" />
      <text x="50%" y="42%" textAnchor="middle" fontSize={W * 0.06} fill={colors.primary} fontWeight="bold" fontFamily="system-ui">
        {label}
      </text>
      <text x="50%" y="56%" textAnchor="middle" fontSize={W * 0.045} fill="white" opacity="0.9" fontFamily="system-ui">
        BAG
      </text>
      <text x="50%" y="76%" textAnchor="middle" fontSize={W * 0.05} fill={colors.accent} fontWeight="bold" fontFamily="system-ui">
        50 KG
      </text>
    </svg>
  );
}

// ─── Steel rebar bundle ─────────────────────────────────────────────────────
function SteelRebarSVG({ colors, label, W, ...props }: SVGProps) {
  const bars = Array.from({ length: 7 }, (_, i) => i);
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="90%" rx="35%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {bars.map((i) => {
        const cols = [35, 50, 65];
        const rows = [40, 52, 64, 76];
        const col = cols[i % 3] ?? 50;
        const row = rows[Math.floor(i / 3)] ?? 50;
        return (
          <g key={i}>
            <circle cx={`${col}%`} cy={`${row}%`} r="8%" fill={colors.primary} />
            <circle cx={`${col}%`} cy={`${row}%`} r="6%" fill={colors.accent} opacity="0.3" />
            <line x1={`${col - 7}%`} y1={`${row}%`} x2={`${col + 7}%`} y2={`${row}%`} stroke={colors.accent} strokeWidth="0.5" opacity="0.5" />
          </g>
        );
      })}
      <text x="50%" y="20%" textAnchor="middle" fontSize={W * 0.055} fill={colors.primary} fontWeight="bold" fontFamily="system-ui">
        {label}
      </text>
    </svg>
  );
}

// ─── Brick wall ─────────────────────────────────────────────────────────────
function BrickWallSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  void W;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="92%" rx="30%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {[25, 42, 59, 76].map((y, row) => (
        <g key={row}>
          {[20, 50, 80].map((x, col) => {
            const offset = row % 2 === 0 ? 0 : 15;
            return (
              <rect
                key={col}
                x={`${x - 12 + offset}%`}
                y={`${y}%`}
                width="24%"
                height="13%"
                rx="1%"
                fill={colors.primary}
                stroke={colors.bg}
                strokeWidth="1"
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ─── AAC block ──────────────────────────────────────────────────────────────
function AacBlockSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="32%" ry="3%" fill="rgba(0,0,0,0.1)" />
      <rect x="22%" y="30%" width="56%" height="40%" rx="2%" fill={colors.primary} />
      <path d={`M${0.22*W} ${0.30*W} L${0.30*W} ${0.22*W} L${0.86*W} ${0.22*W} L${0.78*W} ${0.30*W} Z`} fill={colors.accent} opacity="0.7" />
      <path d={`M${0.78*W} ${0.30*W} L${0.86*W} ${0.22*W} L${0.86*W} ${0.62*W} L${0.78*W} ${0.70*W} Z`} fill={colors.primary} opacity="0.7" />
      {[35, 50, 65].map((x) =>
        [40, 52, 64].map((y) => (
          <circle key={`${x}-${y}`} cx={`${x}%`} cy={`${y}%`} r="1.5%" fill="white" opacity="0.15" />
        ))
      )}
    </svg>
  );
}

// ─── Paint can ──────────────────────────────────────────────────────────────
function PaintCanSVG({ colors, label, W, ...props }: SVGProps) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="25%" ry="3%" fill="rgba(0,0,0,0.12)" />
      <rect x="32%" y="25%" width="36%" height="60%" rx="3%" fill={colors.primary} />
      <rect x="30%" y="22%" width="40%" height="6%" rx="2%" fill={colors.accent} />
      <path d={`M${0.38*W} ${0.22*W} Q${0.50*W} ${0.15*W} ${0.62*W} ${0.22*W}`} stroke={colors.accent} strokeWidth="3" fill="none" />
      <rect x="36%" y="38%" width="28%" height="20%" rx="2%" fill="white" opacity="0.95" />
      <text x="50%" y="48%" textAnchor="middle" fontSize={W * 0.05} fill={colors.primary} fontWeight="bold" fontFamily="system-ui">
        {label.slice(0, 7)}
      </text>
      <text x="50%" y="55%" textAnchor="middle" fontSize={W * 0.035} fill={colors.primary} opacity="0.7" fontFamily="system-ui">
        4L
      </text>
      <circle cx="50%" cy="75%" r="5%" fill={colors.accent} />
    </svg>
  );
}

// ─── Tile stack ─────────────────────────────────────────────────────────────
function TileStackSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="90%" rx="35%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {[72, 58, 44, 30].map((y, i) => (
        <g key={i}>
          <path d={`M${(20 + i * 2)/100*W} ${y/100*W} L${(28 + i * 2)/100*W} ${(y - 8)/100*W} L${(82 + i * 2)/100*W} ${(y - 8)/100*W} L${(74 + i * 2)/100*W} ${y/100*W} Z`} fill={colors.primary} opacity={0.8 - i * 0.1} />
          <rect x={`${20 + i * 2}%`} y={`${y}%`} width={`${54}%`} height={`${6}%`} fill={colors.primary} opacity={0.6 - i * 0.1} />
          <path d={`M${(74 + i * 2)/100*W} ${y/100*W} L${(82 + i * 2)/100*W} ${(y - 8)/100*W} L${(82 + i * 2)/100*W} ${(y - 2)/100*W} L${(74 + i * 2)/100*W} ${(y + 6)/100*W} Z`} fill={colors.primary} opacity={0.4 - i * 0.05} />
        </g>
      ))}
      <line x1="50%" y1="30%" x2="54%" y2="22%" stroke={colors.accent} strokeWidth="0.5" opacity="0.5" />
      <line x1="60%" y1="30%" x2="64%" y2="22%" stroke={colors.accent} strokeWidth="0.5" opacity="0.5" />
    </svg>
  );
}

// ─── Pipe ───────────────────────────────────────────────────────────────────
function PipeSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  void W;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="85%" rx="30%" ry="3%" fill="rgba(0,0,0,0.1)" />
      <rect x="15%" y="38%" width="70%" height="24%" rx="12%" fill={colors.primary} />
      <ellipse cx="15%" cy="50%" rx="5%" ry="12%" fill={colors.accent} opacity="0.4" />
      <ellipse cx="15%" cy="50%" rx="3%" ry="8%" fill={colors.bg} />
      <ellipse cx="85%" cy="50%" rx="4%" ry="10%" fill={colors.primary} opacity="0.6" />
      <rect x="20%" y="42%" width="60%" height="3%" rx="1.5%" fill="white" opacity="0.2" />
      <text x="50%" y="75%" textAnchor="middle" fontSize={W * 0.05} fill={colors.primary} fontWeight="bold" fontFamily="system-ui" opacity="0.7">
        110mm
      </text>
    </svg>
  );
}

// ─── Sand pile ──────────────────────────────────────────────────────────────
function SandPileSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="90%" rx="40%" ry="4%" fill="rgba(0,0,0,0.08)" />
      {/* Sand pile — triangular mound */}
      <path d={`M ${0.20*W} ${0.85*W} L ${0.50*W} ${0.30*W} L ${0.80*W} ${0.85*W} Z`} fill={colors.primary} />
      <path d={`M ${0.25*W} ${0.85*W} L ${0.50*W} ${0.38*W} L ${0.75*W} ${0.85*W} Z`} fill={colors.accent} opacity="0.4" />
      {/* Texture dots */}
      {[40, 50, 60].map((x) =>
        [50, 60, 70, 80].map((y) => (
          <circle key={`${x}-${y}`} cx={`${x}%`} cy={`${y}%`} r="0.8%" fill={colors.accent} opacity="0.5" />
        ))
      )}
    </svg>
  );
}

// ─── Aggregate (gravel/stone) ───────────────────────────────────────────────
function AggregateSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  void W;
  const stones = [
    { x: 30, y: 40, r: 8 }, { x: 50, y: 35, r: 10 }, { x: 70, y: 42, r: 7 },
    { x: 38, y: 58, r: 9 }, { x: 58, y: 55, r: 8 }, { x: 75, y: 62, r: 6 },
    { x: 30, y: 75, r: 7 }, { x: 50, y: 72, r: 9 }, { x: 68, y: 78, r: 8 },
  ];
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="90%" rx="38%" ry="3%" fill="rgba(0,0,0,0.08)" />
      {stones.map((s, i) => (
        <g key={i}>
          <ellipse cx={`${s.x}%`} cy={`${s.y}%`} rx={`${s.r}%`} ry={`${s.r * 0.8}%`} fill={i % 2 === 0 ? colors.primary : colors.accent} />
          <ellipse cx={`${s.x - 1}%`} cy={`${s.y - 1}%`} rx={`${s.r * 0.4}%`} ry={`${s.r * 0.3}%`} fill="white" opacity="0.15" />
        </g>
      ))}
    </svg>
  );
}

// ─── Timber / wood planks ───────────────────────────────────────────────────
function TimberSVG({ colors, label, W, ...props }: SVGProps) {
  void W;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="90%" rx="35%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {/* Stack of planks */}
      {[30, 45, 60, 75].map((y, i) => (
        <g key={i}>
          <rect x="15%" y={`${y}%`} width="70%" height="10%" rx="1%" fill={colors.primary} opacity={0.9 - i * 0.1} />
          {/* Wood grain lines */}
          <line x1="20%" y1={`${y + 3}%`} x2="80%" y2={`${y + 3}%`} stroke={colors.accent} strokeWidth="0.5" opacity="0.3" />
          <line x1="20%" y1={`${y + 7}%`} x2="80%" y2={`${y + 7}%`} stroke={colors.accent} strokeWidth="0.5" opacity="0.3" />
        </g>
      ))}
      <text x="50%" y="22%" textAnchor="middle" fontSize={W * 0.05} fill={colors.primary} fontWeight="bold" fontFamily="system-ui">
        {label.slice(0, 8)}
      </text>
    </svg>
  );
}

// ─── Electrical cable coil ──────────────────────────────────────────────────
function CableSVG({ colors, label, W, ...props }: SVGProps) {
  void W;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="30%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {/* Cable coil — concentric circles */}
      {[10, 18, 26, 34].map((r, i) => (
        <circle
          key={i}
          cx="50%"
          cy="55%"
          r={`${r}%`}
          fill="none"
          stroke={i % 2 === 0 ? colors.primary : colors.accent}
          strokeWidth="4%"
          opacity={0.9 - i * 0.1}
        />
      ))}
      {/* Inner hole */}
      <circle cx="50%" cy="55%" r="5%" fill={colors.bg} />
      <text x="50%" y="20%" textAnchor="middle" fontSize={W * 0.05} fill={colors.primary} fontWeight="bold" fontFamily="system-ui">
        {label.slice(0, 8)}
      </text>
    </svg>
  );
}

// ─── Safety helmet ──────────────────────────────────────────────────────────
function SafetySVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="28%" ry="3%" fill="rgba(0,0,0,0.1)" />
      {/* Helmet dome */}
      <path d={`M ${0.25*W} ${0.70*W} Q ${0.25*W} ${0.35*W} ${0.50*W} ${0.35*W} Q ${0.75*W} ${0.35*W} ${0.75*W} ${0.70*W} Z`} fill={colors.primary} />
      {/* Brim */}
      <ellipse cx="50%" cy="70%" rx="30%" ry="5%" fill={colors.accent} />
      {/* Highlight stripe */}
      <path d={`M ${0.32*W} ${0.55*W} Q ${0.50*W} ${0.40*W} ${0.68*W} ${0.55*W}`} stroke={colors.accent} strokeWidth="2" fill="none" opacity="0.5" />
      {/* Vent lines */}
      <line x1="42%" y1="42%" x2="42%" y2="50%" stroke={colors.accent} strokeWidth="1" opacity="0.4" />
      <line x1="58%" y1="42%" x2="58%" y2="50%" stroke={colors.accent} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

// ─── Scaffolding frame ──────────────────────────────────────────────────────
function ScaffoldSVG({ colors, W, ...props }: Omit<SVGProps, "label"> & { label?: string }) {
  void W;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="92%" rx="35%" ry="3%" fill="rgba(0,0,0,0.08)" />
      {/* Vertical pipes */}
      <rect x="25%" y="20%" width="5%" height="65%" rx="2%" fill={colors.primary} />
      <rect x="70%" y="20%" width="5%" height="65%" rx="2%" fill={colors.primary} />
      {/* Horizontal cross-bars */}
      <rect x="25%" y="35%" width="50%" height="4%" rx="2%" fill={colors.accent} opacity="0.8" />
      <rect x="25%" y="55%" width="50%" height="4%" rx="2%" fill={colors.accent} opacity="0.8" />
      <rect x="25%" y="75%" width="50%" height="4%" rx="2%" fill={colors.accent} opacity="0.8" />
      {/* Diagonal brace */}
      <line x1="28%" y1="35%" x2="72%" y2="55%" stroke={colors.primary} strokeWidth="2" opacity="0.5" />
    </svg>
  );
}

// ─── Generic box (fallback) ─────────────────────────────────────────────────
function GenericBoxSVG({ colors, label, W, ...props }: SVGProps) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill={colors.bg} />
      <ellipse cx="50%" cy="88%" rx="28%" ry="3%" fill="rgba(0,0,0,0.1)" />
      <rect x="25%" y="25%" width="50%" height="50%" rx="4%" fill={colors.primary} />
      {/* Box flaps */}
      <path d="M 25% 25% L 50% 35% L 75% 25%" stroke={colors.accent} strokeWidth="1.5" fill="none" opacity="0.5" />
      <text x="50%" y="58%" textAnchor="middle" fontSize={W * 0.06} fill="white" fontWeight="bold" fontFamily="system-ui">
        {label.slice(0, 6)}
      </text>
    </svg>
  );
}
