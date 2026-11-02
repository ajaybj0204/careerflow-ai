"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { fontSize: 11, fill: "var(--muted)" };
const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "var(--ink)" } };

export function WeeklyChart({ data }: { data: { week: string; submitted: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No applications in this range.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="week" tick={axis} tickFormatter={(w) => new Date(w).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
        <YAxis allowDecimals={false} tick={axis} />
        <Tooltip {...tip} labelFormatter={(w) => `Week of ${new Date(String(w)).toLocaleDateString("en-IN")}`} />
        <Line type="monotone" dataKey="submitted" name="Applications" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GroupBars({ data }: { data: { key: string; submitted: number; responded: number; interviews?: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 8 }}>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={axis} />
        <YAxis type="category" dataKey="key" width={120} tick={axis} />
        <Tooltip {...tip} />
        <Bar dataKey="submitted" name="Applied" fill="var(--line-strong)" radius={[0, 4, 4, 0]} />
        <Bar dataKey="responded" name="Responses" fill="var(--accent)" radius={[0, 4, 4, 0]} />
        {data.some((d) => d.interviews !== undefined) && <Bar dataKey="interviews" name="Interviews" fill="var(--progress)" radius={[0, 4, 4, 0]} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusBars({ data }: { data: { status: string; n: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 8 }}>
        <XAxis type="number" allowDecimals={false} tick={axis} />
        <YAxis type="category" dataKey="status" width={150} tick={axis} />
        <Tooltip {...tip} />
        <Bar dataKey="n" name="Applications" fill="var(--accent)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
