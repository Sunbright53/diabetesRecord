interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  goal?: string | number;
  unit?: string;
  color?: string;
}

export function MetricCard({ icon, label, value, goal, unit, color = "#00C896" }: MetricCardProps) {
  const pct = goal ? Math.min(1, Number(value) / Number(goal)) : null;

  return (
    <div className="bg-bg-elevated rounded-2xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div>
        <span className="text-2xl font-bold text-text-primary">{value}</span>
        {unit && <span className="text-xs text-text-muted ml-1">{unit}</span>}
        {goal && <span className="text-xs text-text-muted"> /{goal}</span>}
      </div>
      {pct != null && (
        <div className="h-1.5 rounded-full bg-bg-raised overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct * 100}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}
