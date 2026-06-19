export interface Pattern {
  id: string;
  label: string;
}

export const patterns: Pattern[] = [
  { id: "rising", label: "CPR Rising" },
  { id: "falling", label: "CPR Falling" },
  { id: "higher-value", label: "Higher Value CPR" },
  { id: "lower-value", label: "Lower Value CPR" },
  { id: "overlapping-higher", label: "Overlapping Higher" },
  { id: "overlapping-lower", label: "Overlapping Lower" },
  { id: "inside-value", label: "Inside Value CPR" },
  { id: "outside-value", label: "Outside Value CPR" },
  { id: "structure-bullish", label: "Structure Bullish" },
  { id: "structure-bearish", label: "Structure Bearish" },
];

interface SidebarProps {
  activePattern: string;
  onSelect: (id: string) => void;
}

export default function Sidebar({ activePattern, onSelect }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 min-h-screen border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Patterns
        </span>
      </div>
      <nav className="flex-1 py-2">
        {patterns.map((pattern) => (
          <button
            key={pattern.id}
            onClick={() => onSelect(pattern.id)}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
              activePattern === pattern.id
                ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {pattern.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
