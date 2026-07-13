import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Mode = "CP" | "AP";
type NetState = "normal" | "partitioned";
type NodeStatus = "active" | "blocked" | "syncing" | "stale";
type LogKind = "info" | "ok" | "err" | "warn";
type TabId = "sim" | "theory" | "cases";
type NodeId = "A" | "B" | "C";

interface Log {
  id: number;
  time: string;
  text: string;
  kind: LogKind;
}

interface NodeData {
  value: string;
  version: number;
  status: NodeStatus;
}

type Nodes = Record<NodeId, NodeData>;
type Conns = { AB: boolean; AC: boolean; BC: boolean };

interface SimulationMetrics {
  totalWrites: number;
  acceptedWrites: number;
  rejectedWrites: number;
  totalReads: number;
  staleReads: number;
  partitionsTriggered: number;
  healOperations: number;
  modeChanges: number;
  syncEvents: number;
}

interface LastReadResult {
  node: NodeId;
  value: string;
  version: number;
  isStale: boolean;
  latencyMs: number;
  consistencyLabel: string;
  explanation: string;
  latestVersion: number;
  time: string;
}

interface SimulationInsights {
  clusterHealth: "Healthy" | "Converging" | "Diverged" | "Partitioned" | "Degraded";
  divergenceCount: number;
  staleNodes: NodeId[];
  blockedNodes: NodeId[];
  syncingNodes: NodeId[];
  freshestNodes: NodeId[];
  latestVersion: number;
  latestValue: string;
  consistencyScore: number;
  availabilityScore: number;
  tradeoffFocus: string;
  recommendation: string;
}

interface SimulationState {
  mode: Mode;
  net: NetState;
  nodes: Nodes;
  conns: Conns;
  logs: Log[];
  busy: boolean;
  pendingAction: string | null;
  metrics: SimulationMetrics;
  lastRead: LastReadResult | null;
  insights: SimulationInsights;
}

interface ApiPayload {
  ok: boolean;
  message?: string;
  state?: SimulationState;
  syncAfterMs?: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const D0 = "Rp 1.000.000";
const D1 = "Rp 1.500.000";
const NODE_IDS: NodeId[] = ["A", "B", "C"];
let _lid = 1;
const ts = () =>
  new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

// SVG node positions, viewBox 0 0 400 336
const NP = {
  A: [200, 72] as [number, number],
  B: [70, 258] as [number, number],
  C: [330, 258] as [number, number],
};
const NR = 34;
const SVG_H = 336;

// ─── Color helpers ───────────────────────────────────────────────────────────
const sc = (s: NodeStatus) =>
  ({ active: "#22c55e", blocked: "#ef4444", syncing: "#f59e0b", stale: "#eab308" }[s]);
const sl = (s: NodeStatus) =>
  ({ active: "AKTIF", blocked: "BLOKIR", syncing: "SINKRON", stale: "USANG" }[s]);
const lc = (k: LogKind) =>
  ({ info: "#38bdf8", ok: "#4ade80", err: "#f87171", warn: "#fbbf24" }[k]);
const li = (k: LogKind) =>
  ({ info: "ℹ", ok: "✓", err: "✕", warn: "⚠" }[k]);
const hc = (health: SimulationInsights["clusterHealth"]) =>
  ({ Healthy: "#4ade80", Converging: "#38bdf8", Diverged: "#f87171", Partitioned: "#fb923c", Degraded: "#fbbf24" }[health]);
const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const nodeList = (nodes: NodeId[]) => (nodes.length ? nodes.join(", ") : "Tidak ada");
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const createEmptyMetrics = (): SimulationMetrics => ({
  totalWrites: 0,
  acceptedWrites: 0,
  rejectedWrites: 0,
  totalReads: 0,
  staleReads: 0,
  partitionsTriggered: 0,
  healOperations: 0,
  modeChanges: 0,
  syncEvents: 0,
});

const createEmptyInsights = (): SimulationInsights => ({
  clusterHealth: "Healthy",
  divergenceCount: 0,
  staleNodes: [],
  blockedNodes: [],
  syncingNodes: [],
  freshestNodes: ["A", "B", "C"],
  latestVersion: 1,
  latestValue: D0,
  consistencyScore: 100,
  availabilityScore: 100,
  tradeoffFocus: "Data correctness first",
  recommendation: "Cluster siap. Gunakan skenario read, write, dan partition untuk menunjukkan trade-off CAP.",
});

// ─── SVG: connection line with animated data packet ──────────────────────────
function Line({
  x1, y1, x2, y2, up,
}: {
  x1: number; y1: number; x2: number; y2: number; up: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const pth = `M ${x1} ${y1} L ${x2} ${y2}`;
  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={up ? "rgba(14,165,233,0.35)" : "rgba(239,68,68,0.25)"}
        strokeWidth={up ? 2 : 1.5}
        strokeDasharray={up ? undefined : "8 5"}
      />
      {up && (
        <>
          <circle r={4.5} fill="#0ea5e9" opacity={0.9}>
            <animateMotion dur="2s" repeatCount="indefinite" path={pth} />
          </circle>
          <circle r={4.5} fill="#0ea5e9" opacity={0.45}>
            <animateMotion dur="2s" repeatCount="indefinite" begin="1s" path={pth} />
          </circle>
        </>
      )}
      {!up && (
        <g>
          <circle cx={mx} cy={my} r={13} fill="#080c14" stroke="rgba(239,68,68,0.45)" strokeWidth={1} />
          <text
            x={mx} y={my + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={12} fill="#ef4444" fontWeight="700"
          >
            ✕
          </text>
        </g>
      )}
    </g>
  );
}

// ─── SVG: node circle ────────────────────────────────────────────────────────
function NodeCircle({ x, y, id, data }: { x: number; y: number; id: string; data: NodeData }) {
  const color = sc(data.status);
  return (
    <g>
      {data.status === "active" && (
        <circle cx={x} cy={y} r={NR + 4} fill="none" stroke="#22c55e" strokeWidth={0.8} opacity={0.18}>
          <animate attributeName="r" values={`${NR + 4};${NR + 14};${NR + 4}`} dur="2.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.18;0;0.18" dur="2.8s" repeatCount="indefinite" />
        </circle>
      )}
      {(data.status === "blocked" || data.status === "syncing") && (
        <circle cx={x} cy={y} r={NR + 4} fill="none" stroke={color} strokeWidth={1} opacity={0.3}>
          <animate attributeName="opacity" values="0.3;0.05;0.3" dur="0.9s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={x} cy={y} r={NR} fill="#0c1528" stroke={color} strokeWidth={2} />
      {/* ID text */}
      <text
        x={x} y={y - 9}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={14} fontWeight="700" fill="#e0eaff"
        style={{ fontFamily: "'Rajdhani', sans-serif" }}
      >
        Node {id}
      </text>
      {/* Status badge */}
      <rect x={x - 22} y={y + 3} width={44} height={14} rx={3} fill={`${color}22`} stroke={`${color}55`} strokeWidth={0.7} />
      <text
        x={x} y={y + 10}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={8} fill={color} fontWeight="500"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {sl(data.status)}
      </text>
    </g>
  );
}

// ─── SVG: full network diagram ────────────────────────────────────────────────
function NetworkDiagram({ nodes, conns }: { nodes: Nodes; conns: Conns }) {
  const [A, B, C] = [NP.A, NP.B, NP.C];
  return (
    <svg viewBox={`0 0 400 ${SVG_H}`} className="w-full h-auto" style={{ maxHeight: SVG_H }}>
      <defs>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(14,165,233,0.04)" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={400} height={SVG_H} fill="url(#grid)" />

      {/* Connection lines */}
      <Line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} up={conns.AB} />
      <Line x1={A[0]} y1={A[1]} x2={C[0]} y2={C[1]} up={conns.AC} />
      <Line x1={B[0]} y1={B[1]} x2={C[0]} y2={C[1]} up={conns.BC} />

      {/* Node circles */}
      <NodeCircle x={A[0]} y={A[1]} id="A" data={nodes.A} />
      <NodeCircle x={B[0]} y={B[1]} id="B" data={nodes.B} />
      <NodeCircle x={C[0]} y={C[1]} id="C" data={nodes.C} />

      {/* Data value labels */}
      {(["A", "B", "C"] as const).map((id) => {
        const [px, py] = NP[id];
        const isTop = id === "A";
        const ly = isTop ? py - NR - 20 : py + NR + 20;
        const col = sc(nodes[id].status);
        return (
          <g key={id}>
            <rect x={px - 54} y={ly - 10} width={108} height={20} rx={4}
              fill="#060d1a" stroke={`${col}35`} strokeWidth={1} />
            <text
              x={px} y={ly + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={9.5} fill={col}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {nodes[id].value}  v{nodes[id].version}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Simulation Tab ───────────────────────────────────────────────────────────
function SimTab({
  mode, net, nodes, conns, logs, logRef,
  busy, pendingAction, isLoading, demoBusy,
  metrics, insights, lastRead,
  onPartition, onHeal, onWriteA, onWriteB, onReadNode, onStartGuidedDemo, onReset,
}: {
  mode: Mode; net: NetState; nodes: Nodes; conns: Conns;
  logs: Log[]; logRef: React.RefObject<HTMLDivElement>;
  busy: boolean; pendingAction: string | null; isLoading: boolean; demoBusy: boolean;
  metrics: SimulationMetrics; insights: SimulationInsights; lastRead: LastReadResult | null;
  onPartition: () => void; onHeal: () => void;
  onWriteA: () => void; onWriteB: () => void; onReadNode: (node: NodeId) => void;
  onStartGuidedDemo: () => void; onReset: () => void;
}) {
  const cpActive = mode === "CP";
  const modeColor = cpActive ? "#38bdf8" : "#fb923c";
  const modeBg = cpActive ? "rgba(14,165,233,0.08)" : "rgba(249,115,22,0.08)";
  const modeBorder = cpActive ? "rgba(14,165,233,0.25)" : "rgba(249,115,22,0.25)";
  const actionsDisabled = busy || isLoading || demoBusy;
  const healthColor = hc(insights.clusterHealth);
  const staleReadRate = metrics.totalReads === 0 ? 0 : Math.round((metrics.staleReads / metrics.totalReads) * 100);
  const rejectRate = metrics.totalWrites === 0 ? 0 : Math.round((metrics.rejectedWrites / metrics.totalWrites) * 100);

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
      {/* ── Left column ── */}
      <div className="flex flex-col gap-4">
        {/* Mode banner */}
        <div className="rounded-xl p-4" style={{ background: modeBg, border: `1px solid ${modeBorder}` }}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2.5 py-0.5 rounded text-xs font-bold"
              style={{
                background: modeBg,
                border: `1px solid ${modeColor}55`,
                color: modeColor,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {mode} MODE
            </span>
            <span className="text-sm font-semibold" style={{ color: "#e0eaff", fontFamily: "'Rajdhani', sans-serif" }}>
              {cpActive ? "Consistency + Partition Tolerance" : "Availability + Partition Tolerance"}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
            {cpActive
              ? "Saat partisi terjadi, sistem MENOLAK write yang tidak bisa dikonfirmasi ke semua node. Data tetap benar, tapi availability turun."
              : "Saat partisi terjadi, sistem MENERIMA write meskipun belum bisa sinkron ke semua node. Layanan tetap aktif, tapi data bisa sementara berbeda."}
          </p>
          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
            <div
              className="rounded-lg p-3"
              style={{ background: "rgba(8,12,20,0.55)", border: `1px solid ${healthColor}28` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                  CLUSTER HEALTH
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold"
                  style={{ background: `${healthColor}18`, color: healthColor, border: `1px solid ${healthColor}33`, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {insights.clusterHealth}
                </span>
              </div>
              <div className="text-sm font-semibold mb-1" style={{ color: "#e0eaff", fontFamily: "'Rajdhani', sans-serif" }}>
                {insights.tradeoffFocus}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                {insights.recommendation}
              </p>
            </div>
            <div className="grid gap-2">
              {[
                { label: "Consistency", value: insights.consistencyScore, color: "#38bdf8" },
                { label: "Availability", value: insights.availabilityScore, color: "#fb923c" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg p-3" style={{ background: "rgba(8,12,20,0.55)", border: `1px solid ${metric.color}22` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{metric.label}</span>
                    <span style={{ color: metric.color, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{pct(metric.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: pct(metric.value), background: metric.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Network diagram */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#080c14", border: "1px solid rgba(14,165,233,0.12)" }}
        >
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span
              className="text-xs"
              style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
            >
              NETWORK TOPOLOGY
            </span>
            <div
              className="flex gap-3 text-xs"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              <span style={{ color: "#4ade80" }}>● Aktif</span>
              <span style={{ color: "#fbbf24" }}>● Sinkron/Usang</span>
              <span style={{ color: "#f87171" }}>● Blokir</span>
            </div>
          </div>
          <NetworkDiagram nodes={nodes} conns={conns} />
        </div>

        {/* Node data cards */}
        <div className="grid grid-cols-3 gap-3">
          {NODE_IDS.map((id) => {
            const col = sc(nodes[id].status);
            return (
              <div
                key={id}
                className="rounded-lg p-3"
                style={{ background: "#0c1528", border: `1px solid ${col}28` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="font-bold"
                    style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "#e0eaff" }}
                  >
                    Node {id}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{
                      background: `${col}18`,
                      color: col,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                    }}
                  >
                    {sl(nodes[id].status)}
                  </span>
                </div>
                <div
                  className="text-xs"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: col }}
                >
                  {nodes[id].value}
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "#374151", fontSize: 10 }}
                >
                  versi {nodes[id].version}
                </div>
                <button
                  onClick={() => onReadNode(id)}
                  disabled={actionsDisabled}
                  className="mt-3 w-full rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-150 disabled:opacity-35"
                  style={{
                    background: `${col}12`,
                    border: `1px solid ${col}30`,
                    color: col,
                    fontFamily: "'JetBrains Mono', monospace",
                    cursor: actionsDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  Read Node {id}
                </button>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
          <div className="rounded-xl p-4" style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.12)" }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>HASIL READ TERAKHIR</span>
              {lastRead && (
                <span style={{ color: lastRead.isStale ? "#fbbf24" : "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                  {lastRead.consistencyLabel}
                </span>
              )}
            </div>
            {lastRead ? (
              <>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div style={{ color: "#e0eaff", fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700 }}>
                      Node {lastRead.node}
                    </div>
                    <div style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {lastRead.time} · latency ~{lastRead.latencyMs}ms
                    </div>
                  </div>
                  <div style={{ color: lastRead.isStale ? "#fbbf24" : "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    v{lastRead.version} / latest v{lastRead.latestVersion}
                  </div>
                </div>
                <div className="mb-2" style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700 }}>
                  {lastRead.value}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                  {lastRead.explanation}
                </p>
              </>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: "#6b7280" }}>
                Belum ada read. Coba baca Node A, B, atau C setelah write atau partition untuk membuktikan trade-off CAP.
              </p>
            )}
          </div>
          <div className="rounded-xl p-4" style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.12)" }}>
            <div className="mb-3" style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>STATUS CLUSTER</div>
            <div className="space-y-2 text-xs" style={{ color: "#9ca3af" }}>
              <div className="flex items-center justify-between gap-3">
                <span>Fresh nodes</span>
                <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{nodeList(insights.freshestNodes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Stale nodes</span>
                <span style={{ color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>{nodeList(insights.staleNodes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Syncing nodes</span>
                <span style={{ color: "#38bdf8", fontFamily: "'JetBrains Mono', monospace" }}>{nodeList(insights.syncingNodes)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Blocked nodes</span>
                <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>{nodeList(insights.blockedNodes)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="flex flex-col gap-4">
        {/* Control buttons */}
        <div
          className="rounded-xl p-4"
          style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.12)" }}
        >
          <div
            className="text-xs mb-3"
            style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
          >
            KONTROL SIMULASI
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Btn onClick={onWriteA} disabled={actionsDisabled} color="#38bdf8" bg="rgba(14,165,233,0.12)" border="rgba(14,165,233,0.3)">
                ✏ Write → Node A
              </Btn>
              <Btn onClick={onWriteB} disabled={actionsDisabled} color="#38bdf8" bg="rgba(14,165,233,0.12)" border="rgba(14,165,233,0.3)">
                ✏ Write → Node B
              </Btn>
            </div>
            <Btn
              onClick={onPartition}
              disabled={net === "partitioned" || actionsDisabled}
              color="#f87171" bg="rgba(239,68,68,0.1)" border="rgba(239,68,68,0.3)"
              full
            >
              ⚡ Trigger Network Partition
            </Btn>
            <Btn
              onClick={onHeal}
              disabled={net === "normal" || actionsDisabled}
              color="#4ade80" bg="rgba(34,197,94,0.1)" border="rgba(34,197,94,0.3)"
              full
            >
              🔗 Pulihkan Jaringan
            </Btn>
            <Btn
              onClick={onReset}
              disabled={isLoading}
              color="#9ca3af" bg="rgba(107,114,128,0.1)" border="rgba(107,114,128,0.25)"
              full
            >
              ↺ Reset Simulasi
            </Btn>
            <Btn
              onClick={onStartGuidedDemo}
              disabled={actionsDisabled}
              color="#d8b4fe" bg="rgba(168,85,247,0.1)" border="rgba(168,85,247,0.3)"
              full
            >
              ▶ Auto Demo CAP Story
            </Btn>
          </div>

          <div
            className="mt-3 rounded-lg p-3 text-xs"
            style={{
              background: "rgba(14,165,233,0.04)",
              border: "1px solid rgba(14,165,233,0.08)",
              color: isLoading ? "#fbbf24" : busy ? "#38bdf8" : "#6b7280",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {isLoading
              ? "Menghubungkan frontend ke backend simulator..."
              : demoBusy
                ? "Auto demo sedang berjalan. Backend akan menjalankan skenario presentasi secara otomatis."
                : busy
                ? `Backend sedang menjalankan: ${pendingAction ?? "transisi"}`
                : "Frontend dan backend sedang sinkron."}
          </div>

          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            {[
              { label: "Write diterima", value: `${metrics.acceptedWrites}/${metrics.totalWrites}`, hint: `${100 - rejectRate}% success`, color: "#4ade80" },
              { label: "Write ditolak", value: `${metrics.rejectedWrites}`, hint: `${rejectRate}% reject rate`, color: "#f87171" },
              { label: "Total read", value: `${metrics.totalReads}`, hint: `${staleReadRate}% stale read`, color: "#38bdf8" },
              { label: "Network event", value: `${metrics.partitionsTriggered}/${metrics.healOperations}`, hint: `partition/heal`, color: "#fb923c" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "rgba(8,12,20,0.55)", border: `1px solid ${item.color}22` }}>
                <div className="mb-1" style={{ color: "#6b7280", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{item.label}</div>
                <div style={{ color: item.color, fontFamily: "'Rajdhani', sans-serif", fontSize: 24, fontWeight: 700 }}>{item.value}</div>
                <div style={{ color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{item.hint}</div>
              </div>
            ))}
          </div>

          {/* Step guide */}
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid rgba(14,165,233,0.08)" }}
          >
            <div
              className="text-xs mb-2"
              style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
            >
              PANDUAN SKENARIO
            </div>
            <ol className="space-y-1">
              {[
                "Pilih mode CP atau AP di header",
                `Klik "Write → Node A" dalam kondisi normal`,
                `Klik "Trigger Partition" untuk memutus jaringan`,
                "Coba Write dan Read di node berbeda — perhatikan divergensi!",
                "Pulihkan jaringan dan lihat metrik sinkronisasi cluster",
              ].map((s, i) => (
                <li key={i} className="text-xs flex gap-2" style={{ color: "#6b7280" }}>
                  <span style={{ color: "#374151", flexShrink: 0 }}>{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Event log */}
        <div
          className="flex-1 rounded-xl flex flex-col"
          style={{ background: "#080c14", border: "1px solid rgba(14,165,233,0.12)", minHeight: 260 }}
        >
          <div
            className="px-4 pt-3 pb-2 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(14,165,233,0.07)" }}
          >
            <span
              className="text-xs"
              style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
            >
              EVENT LOG
            </span>
            <span
              className="text-xs"
              style={{ color: "#1f2937", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {logs.length} event
            </span>
          </div>
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-3 space-y-2"
            style={{ maxHeight: 360 }}
          >
            {logs.map((l) => (
              <div key={l.id} className="flex gap-2 items-start text-xs">
                <span
                  className="shrink-0"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#1f2937",
                    fontSize: 10,
                    marginTop: 1,
                    minWidth: 56,
                  }}
                >
                  {l.time}
                </span>
                <span className="shrink-0 w-3" style={{ color: lc(l.kind) }}>
                  {li(l.kind)}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: lc(l.kind),
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  {l.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable button ──────────────────────────────────────────────────────────
function Btn({
  children, onClick, disabled, color, bg, border, full,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color: string;
  bg: string;
  border: string;
  full?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${full ? "w-full" : "flex-1"} py-2 px-3 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-35 hover:opacity-85 active:scale-95`}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontFamily: "'Inter', sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─── Theory Tab ───────────────────────────────────────────────────────────────
function TheoryTab() {
  const props = [
    {
      letter: "C",
      name: "Consistency",
      color: "#38bdf8",
      bg: "rgba(14,165,233,0.07)",
      border: "rgba(14,165,233,0.22)",
      desc: "Setelah write berhasil, semua node menampilkan data terbaru yang sama. Tidak ada node yang menunjukkan data lama.",
      pros: ["Data selalu akurat", "Cocok untuk transaksi kritis", "Tidak ada data yang saling bertentangan"],
      cons: ["Latensi bisa lebih tinggi", "Availability bisa turun saat partisi", "Sebagian request bisa ditolak"],
      examples: ["Saldo rekening bank", "Data transaksi keuangan", "Rekam medis sensitif"],
    },
    {
      letter: "A",
      name: "Availability",
      color: "#fb923c",
      bg: "rgba(249,115,22,0.07)",
      border: "rgba(249,115,22,0.22)",
      desc: "Setiap request ke node yang aktif selalu mendapat respons, meskipun data yang dikembalikan belum tentu yang paling baru.",
      pros: ["Layanan selalu aktif", "Respons cepat", "Cocok untuk trafik sangat tinggi"],
      cons: ["Data bisa sementara usang", "Antar-node bisa nilai berbeda", "Perlu eventual consistency"],
      examples: ["Feed media sosial", "Sistem analitik", "Sistem rekomendasi"],
    },
    {
      letter: "P",
      name: "Partition Tolerance",
      color: "#4ade80",
      bg: "rgba(34,197,94,0.07)",
      border: "rgba(34,197,94,0.22)",
      desc: "Sistem tetap beroperasi meskipun ada gangguan komunikasi antar-node. Dalam sistem terdistribusi nyata, P hampir tidak bisa diabaikan.",
      pros: ["Sistem tetap jalan saat jaringan bermasalah", "Realistis dengan kondisi produksi", "Wajib untuk sistem terdistribusi"],
      cons: ["Memaksa pilihan C atau A saat partisi", "Kompleksitas desain lebih tinggi"],
      examples: ["Semua sistem terdistribusi modern", "Cloud databases", "Microservices global"],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Intro card */}
      <div
        className="rounded-xl p-6"
        style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.15)" }}
      >
        <h2
          className="mb-3"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: "#e0eaff",
          }}
        >
          Apa itu CAP Theorem?
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
          CAP Theorem adalah prinsip dasar sistem terdistribusi yang menyatakan bahwa ketika terjadi{" "}
          <strong style={{ color: "#f87171" }}>network partition</strong>, sistem tidak dapat sekaligus
          mempertahankan <strong style={{ color: "#38bdf8" }}>Consistency</strong> dan{" "}
          <strong style={{ color: "#fb923c" }}>Availability</strong> secara penuh. Sistem harus memilih
          prioritas.
        </p>
        <div
          className="mt-4 p-3 rounded-lg text-xs"
          style={{
            background: "rgba(14,165,233,0.04)",
            border: "1px solid rgba(14,165,233,0.1)",
            color: "#6b7280",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          💡 Catatan: "Pilih 2 dari 3" adalah penyederhanaan populer. Inti sesungguhnya: saat partition
          terjadi, sistem harus memilih CP atau AP.
        </div>
      </div>

      {/* CAP Triangle */}
      <div
        className="rounded-xl p-6 flex flex-col items-center"
        style={{ background: "#080c14", border: "1px solid rgba(14,165,233,0.1)" }}
      >
        <div
          className="text-xs mb-4 self-start"
          style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
        >
          SEGITIGA CAP
        </div>
        <svg viewBox="0 0 360 270" width={340} height={250}>
          <polygon
            points="180,18 28,245 332,245"
            fill="rgba(14,165,233,0.03)"
            stroke="rgba(14,165,233,0.18)"
            strokeWidth={1.5}
          />
          {/* CP half */}
          <polygon points="180,18 28,245 180,245" fill="rgba(14,165,233,0.05)" />
          {/* AP half */}
          <polygon points="180,18 332,245 180,245" fill="rgba(249,115,22,0.05)" />

          {/* Vertices */}
          {[
            { cx: 180, cy: 18, label: "C", sub: "Consistency", col: "#38bdf8", anchor: "middle" as const },
            { cx: 28, cy: 245, label: "A", sub: "Availability", col: "#fb923c", anchor: "middle" as const },
            { cx: 332, cy: 245, label: "P", sub: "Partition\nTolerance", col: "#4ade80", anchor: "middle" as const },
          ].map((v) => (
            <g key={v.label}>
              <circle cx={v.cx} cy={v.cy} r={22} fill="#0c1528" stroke={v.col} strokeWidth={2} />
              <text
                x={v.cx} y={v.cy + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={15} fontWeight="700" fill={v.col}
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {v.label}
              </text>
            </g>
          ))}
          {/* Vertex labels */}
          <text x={180} y={-4} textAnchor="middle" fontSize={10} fill="#38bdf8" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Consistency</text>
          <text x={-14} y={260} textAnchor="middle" fontSize={10} fill="#fb923c" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Availability</text>
          <text x={373} y={260} textAnchor="middle" fontSize={10} fill="#4ade80" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Partition Tolerance</text>

          {/* Zone labels */}
          <text x={88} y={178} textAnchor="middle" fontSize={13} fontWeight="700" fill="#38bdf8" opacity={0.6} style={{ fontFamily: "'Rajdhani', sans-serif" }}>CP</text>
          <text x={272} y={178} textAnchor="middle" fontSize={13} fontWeight="700" fill="#fb923c" opacity={0.6} style={{ fontFamily: "'Rajdhani', sans-serif" }}>AP</text>
          <text x={180} y={258} textAnchor="middle" fontSize={10} fill="#374151" style={{ fontFamily: "'Rajdhani', sans-serif" }}>CA — tidak realistis saat partisi</text>
        </svg>
      </div>

      {/* C A P cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {props.map((p) => (
          <div
            key={p.letter}
            className="rounded-xl p-5"
            style={{ background: p.bg, border: `1px solid ${p.border}` }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold"
                style={{
                  background: `${p.color}18`,
                  border: `1px solid ${p.color}45`,
                  color: p.color,
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                {p.letter}
              </div>
              <span
                className="font-bold"
                style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, color: "#e0eaff" }}
              >
                {p.name}
              </span>
            </div>
            <p className="text-xs leading-relaxed mb-4" style={{ color: "#9ca3af" }}>
              {p.desc}
            </p>
            <div className="space-y-3">
              <div>
                <div
                  className="text-xs mb-1"
                  style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
                >
                  ✓ KELEBIHAN
                </div>
                {p.pros.map((x, i) => (
                  <div key={i} className="text-xs" style={{ color: "#6b7280" }}>
                    • {x}
                  </div>
                ))}
              </div>
              <div>
                <div
                  className="text-xs mb-1"
                  style={{ color: "#f87171", fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
                >
                  ✕ KEKURANGAN
                </div>
                {p.cons.map((x, i) => (
                  <div key={i} className="text-xs" style={{ color: "#6b7280" }}>
                    • {x}
                  </div>
                ))}
              </div>
              <div>
                <div
                  className="text-xs mb-1"
                  style={{ color: p.color, fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
                >
                  COCOK UNTUK
                </div>
                {p.examples.map((x, i) => (
                  <div key={i} className="text-xs" style={{ color: "#6b7280" }}>
                    • {x}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Partition decision */}
      <div
        className="rounded-xl p-6"
        style={{ background: "#0c1528", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        <h3
          className="mb-4"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            color: "#f87171",
          }}
        >
          ⚡ Mengapa Partisi Memaksa Pilihan?
        </h3>
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            {
              title: "Pilih CP",
              color: "#38bdf8",
              bg: "rgba(14,165,233,0.07)",
              border: "rgba(14,165,233,0.2)",
              desc: "Node yang tidak bisa sinkron akan MENOLAK request. Data tetap benar, tapi sebagian pengguna tidak dilayani sementara.",
              motto: "Kebenaran Data > Layanan Aktif",
            },
            {
              title: "Pilih AP",
              color: "#fb923c",
              bg: "rgba(249,115,22,0.07)",
              border: "rgba(249,115,22,0.2)",
              desc: "Semua node TETAP MELAYANI request. Data bisa sementara berbeda antar-node sampai jaringan pulih dan sync selesai.",
              motto: "Layanan Aktif > Kebenaran Data",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg p-4"
              style={{ background: item.bg, border: `1px solid ${item.border}` }}
            >
              <div
                className="font-bold mb-2"
                style={{ fontFamily: "'Rajdhani', sans-serif", color: item.color, fontSize: 16 }}
              >
                {item.title}
              </div>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "#9ca3af" }}>
                {item.desc}
              </p>
              <div
                className="text-xs"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: item.color }}
              >
                Prioritas: {item.motto}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Cases Tab ────────────────────────────────────────────────────────────────
function CasesTab() {
  const [active, setActive] = useState("bank");

  const cases = [
    {
      id: "bank",
      icon: "🏦",
      title: "Sistem Perbankan",
      type: "CP",
      typeColor: "#38bdf8",
      typeBg: "rgba(14,165,233,0.12)",
      typeBorder: "rgba(14,165,233,0.5)",
      subtitle: "Consistency + Partition Tolerance",
      analogy:
        "Bayangkan beberapa cabang bank yang berbagi data saldo yang sama. Saat jalur komunikasi antar cabang terputus, lebih baik satu cabang BERHENTI melayani sementara daripada mencairkan uang dengan data saldo yang salah.",
      scenario:
        "Nasabah menarik Rp 500.000 di ATM cabang A. Saat jaringan bermasalah, sistem CP akan menolak transaksi daripada mengizinkan penarikan yang mungkin membuat saldo minus atau menyebabkan double-spend.",
      points: [
        "Saldo harus selalu benar di semua node",
        "Transaksi tidak boleh ganda (double-spend)",
        "Lebih baik request ditolak daripada data salah",
        "Transaksi transfer, pembayaran, penarikan ATM",
      ],
      dbs: ["PostgreSQL (single node)", "MySQL strong replication", "MongoDB (mode CP)"],
    },
    {
      id: "social",
      icon: "📱",
      title: "Media Sosial",
      type: "AP",
      typeColor: "#fb923c",
      typeBg: "rgba(249,115,22,0.12)",
      typeBorder: "rgba(249,115,22,0.5)",
      subtitle: "Availability + Partition Tolerance",
      analogy:
        "Jutaan orang membuka feed setiap detik. Apakah masalah besar jika postingan yang baru di-upload terlihat 1-2 detik lebih lambat di beberapa pengguna? Tidak — yang penting platform tetap bisa dibuka dan responsif.",
      scenario:
        "Pengguna di Jakarta meng-upload foto. Pengguna di Surabaya mungkin belum melihat foto itu selama 1-2 detik akibat propagasi, tapi platform tetap bisa diakses dan semua fitur bekerja normal.",
      points: [
        "Layanan harus selalu responsif untuk jutaan user",
        "Like atau komentar terlambat beberapa detik masih oke",
        "Data akhirnya akan konsisten (eventual consistency)",
        "Downtime jauh lebih mahal dari data sedikit terlambat",
      ],
      dbs: ["Cassandra", "DynamoDB", "Redis (mode cluster)"],
    },
    {
      id: "ecommerce",
      icon: "🛒",
      title: "E-Commerce",
      type: "Mixed",
      typeColor: "#a78bfa",
      typeBg: "rgba(167,139,250,0.12)",
      typeBorder: "rgba(167,139,250,0.5)",
      subtitle: "Campuran CP dan AP sesuai fitur",
      analogy:
        "Admin gudang di kota berbeda yang mencatat stok barang yang sama. Halaman katalog (AP) boleh sedikit terlambat update. Tapi saat checkout dan pembayaran (CP), stok dan harga harus pasti akurat.",
      scenario:
        "Halaman produk boleh menampilkan harga dari cache (AP). Tapi saat pengguna klik 'Beli Sekarang', sistem memverifikasi stok real-time (CP) sebelum memproses pembayaran untuk menghindari oversell.",
      points: [
        "Katalog produk → AP (boleh sedikit terlambat update)",
        "Keranjang belanja → AP (toleran terhadap sedikit delay)",
        "Stok barang saat checkout → CP (harus akurat!)",
        "Pembayaran dan invoice → CP (tidak boleh ada duplikat)",
      ],
      dbs: ["PostgreSQL + Redis + Cassandra", "Microservices dengan DB berbeda per domain"],
    },
  ];

  const cur = cases.find((c) => c.id === active)!;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Case selector */}
      <div className="flex gap-3">
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: active === c.id ? c.typeBg : "#0c1528",
              border: `1px solid ${active === c.id ? c.typeBorder : "rgba(14,165,233,0.1)"}`,
              color: active === c.id ? c.typeColor : "#6b7280",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
            }}
          >
            {c.icon} {c.title}
          </button>
        ))}
      </div>

      {/* Detail card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: `1px solid ${cur.typeColor}28` }}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{
            background: cur.typeBg,
            borderBottom: `1px solid ${cur.typeColor}20`,
          }}
        >
          <div className="flex items-center gap-4">
            <span style={{ fontSize: 40 }}>{cur.icon}</span>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3
                  style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#e0eaff",
                  }}
                >
                  {cur.title}
                </h3>
                <span
                  className="px-3 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: cur.typeBg,
                    border: `1px solid ${cur.typeBorder}`,
                    color: cur.typeColor,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {cur.type}
                </span>
              </div>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                {cur.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6" style={{ background: "#080c14" }}>
          <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {/* Left: analogy + scenario */}
            <div>
              <div
                className="text-xs mb-2"
                style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
              >
                ANALOGI
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "#9ca3af" }}>
                {cur.analogy}
              </p>
              <div
                className="rounded-lg p-4"
                style={{
                  background: `${cur.typeColor}07`,
                  border: `1px solid ${cur.typeColor}20`,
                }}
              >
                <div
                  className="text-xs mb-2"
                  style={{ color: cur.typeColor, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  SKENARIO NYATA
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
                  {cur.scenario}
                </p>
              </div>
            </div>

            {/* Right: key points + DB */}
            <div>
              <div
                className="text-xs mb-2"
                style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
              >
                POIN KUNCI
              </div>
              <ul className="space-y-2 mb-5">
                {cur.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: "#9ca3af" }}>
                    <span style={{ color: cur.typeColor, flexShrink: 0 }}>▶</span>
                    {p}
                  </li>
                ))}
              </ul>
              <div
                className="text-xs mb-2"
                style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
              >
                DATABASE YANG UMUM DIGUNAKAN
              </div>
              <div className="flex flex-wrap gap-2">
                {cur.dbs.map((d, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full text-xs"
                    style={{
                      background: "#0c1528",
                      border: "1px solid rgba(14,165,233,0.12)",
                      color: "#6b7280",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CP vs AP summary */}
      <div
        className="rounded-xl p-5"
        style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.1)" }}
      >
        <div
          className="text-xs mb-4"
          style={{ color: "#374151", fontFamily: "'JetBrains Mono', monospace" }}
        >
          RINGKASAN: CP vs AP
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[
            {
              title: "CP — Consistency Priority",
              color: "#38bdf8",
              bg: "rgba(14,165,233,0.06)",
              border: "rgba(14,165,233,0.18)",
              pros: ["Data selalu konsisten", "Cocok untuk data kritis"],
              cons: ["Mungkin menolak request", "Availability bisa turun"],
              motto: '"Lebih baik diam daripada salah"',
            },
            {
              title: "AP — Availability Priority",
              color: "#fb923c",
              bg: "rgba(249,115,22,0.06)",
              border: "rgba(249,115,22,0.18)",
              pros: ["Layanan selalu aktif", "Responsif untuk semua user"],
              cons: ["Data bisa sementara usang", "Perlu eventual consistency"],
              motto: '"Lebih baik jawab daripada diam"',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg p-4"
              style={{ background: item.bg, border: `1px solid ${item.border}` }}
            >
              <div
                className="font-bold mb-3"
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: item.color,
                  fontSize: 15,
                }}
              >
                {item.title}
              </div>
              <div className="space-y-1 text-xs mb-3" style={{ color: "#9ca3af" }}>
                {item.pros.map((p, i) => (
                  <div key={i}>✓ {p}</div>
                ))}
                {item.cons.map((c, i) => (
                  <div key={i}>✕ {c}</div>
                ))}
              </div>
              <div
                className="text-xs italic"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: item.color }}
              >
                Motto: {item.motto}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<Mode>("CP");
  const [net, setNet] = useState<NetState>("normal");
  const [tab, setTab] = useState<TabId>("sim");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoBusy, setDemoBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SimulationMetrics>(createEmptyMetrics());
  const [lastRead, setLastRead] = useState<LastReadResult | null>(null);
  const [insights, setInsights] = useState<SimulationInsights>(createEmptyInsights());
  const [nodes, setNodes] = useState<Nodes>({
    A: { value: D0, version: 1, status: "active" },
    B: { value: D0, version: 1, status: "active" },
    C: { value: D0, version: 1, status: "active" },
  });
  const [conns, setConns] = useState<Conns>({ AB: true, AC: true, BC: true });
  const [logs, setLogs] = useState<Log[]>([
    { id: _lid++, time: ts(), text: "Sistem terdistribusi siap. 3 node terhubung penuh.", kind: "ok" },
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const applySnapshot = useCallback((next: SimulationState) => {
    setMode(next.mode);
    setNet(next.net);
    setNodes(next.nodes);
    setConns(next.conns);
    setLogs(next.logs);
    setBusy(next.busy);
    setPendingAction(next.pendingAction);
    setMetrics(next.metrics);
    setLastRead(next.lastRead);
    setInsights(next.insights);
  }, []);

  const clearScheduledRefresh = useCallback(() => {
    if (refreshRef.current !== null) {
      window.clearTimeout(refreshRef.current);
      refreshRef.current = null;
    }
  }, []);

  const loadSimulation = useCallback(async () => {
    const response = await fetch("/api/simulation", { cache: "no-store" });
    const payload = (await response.json()) as ApiPayload;

    if (!response.ok || !payload.ok || !payload.state) {
      throw new Error(payload.message || "Gagal mengambil state simulasi dari backend.");
    }

    applySnapshot(payload.state);
    setApiError(null);
  }, [applySnapshot]);

  const scheduleRefresh = useCallback((delayMs?: number | null) => {
    if (!delayMs) return;

    clearScheduledRefresh();
    refreshRef.current = window.setTimeout(() => {
      loadSimulation().catch((error: Error) => {
        setApiError(error.message || "Gagal menyinkronkan state simulasi.");
        setIsLoading(false);
      });
    }, delayMs + 80);
  }, [clearScheduledRefresh, loadSimulation]);

  const postAction = useCallback(async (path: string, body?: Record<string, string>) => {
    clearScheduledRefresh();

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const payload = (await response.json()) as ApiPayload;

      if (payload.state) {
        applySnapshot(payload.state);
      }

      if (!response.ok || !payload.ok) {
        setApiError(payload.message || "Aksi backend gagal diproses.");
        return;
      }

      setApiError(null);
      scheduleRefresh(payload.syncAfterMs);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Tidak dapat menghubungi backend.");
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot, clearScheduledRefresh, scheduleRefresh]);

  const runAction = useCallback(async (path: string, body?: Record<string, string>) => {
    clearScheduledRefresh();

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const payload = (await response.json()) as ApiPayload;

      if (payload.state) {
        applySnapshot(payload.state);
      }

      if (!response.ok || !payload.ok) {
        const message = payload.message || "Aksi backend gagal diproses.";
        setApiError(message);
        throw new Error(message);
      }

      setApiError(null);
      scheduleRefresh(payload.syncAfterMs);
      if (payload.syncAfterMs) {
        await wait(payload.syncAfterMs + 120);
        await loadSimulation();
      }

      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tidak dapat menghubungi backend.";
      setApiError(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot, clearScheduledRefresh, loadSimulation, scheduleRefresh]);

  useEffect(() => {
    let mounted = true;

    loadSimulation().catch((error: Error) => {
      if (!mounted) return;
      setApiError(error.message || "Backend tidak tersedia.");
    }).finally(() => {
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearScheduledRefresh();
    };
  }, [clearScheduledRefresh, loadSimulation]);

  const triggerPartition = () => {
    void postAction("/api/simulation/actions/partition");
  };

  const healNetwork = () => {
    void postAction("/api/simulation/actions/heal");
  };

  const writeToA = () => {
    void postAction("/api/simulation/actions/write", { node: "A" });
  };

  const writeToB = () => {
    void postAction("/api/simulation/actions/write", { node: "B" });
  };

  const readNode = (node: NodeId) => {
    void postAction("/api/simulation/actions/read", { node });
  };

  const reset = () => {
    void postAction("/api/simulation/actions/reset");
  };

  const changeMode = (nextMode: Mode) => {
    void postAction("/api/simulation/mode", { mode: nextMode });
  };

  const startGuidedDemo = useCallback(async () => {
    if (demoBusy || busy || isLoading) return;

    setDemoBusy(true);
    setApiError(null);

    try {
      await runAction("/api/simulation/actions/reset");
      await wait(300);
      await runAction("/api/simulation/mode", { mode: "CP" });
      await wait(300);
      await runAction("/api/simulation/actions/write", { node: "A" });
      await wait(250);
      await runAction("/api/simulation/actions/partition");
      await wait(250);
      await runAction("/api/simulation/actions/write", { node: "B" });
      await wait(250);
      await runAction("/api/simulation/actions/read", { node: "A" });
      await wait(350);
      await runAction("/api/simulation/actions/reset");
      await wait(350);
      await runAction("/api/simulation/mode", { mode: "AP" });
      await wait(250);
      await runAction("/api/simulation/actions/write", { node: "A" });
      await wait(250);
      await runAction("/api/simulation/actions/partition");
      await wait(250);
      await runAction("/api/simulation/actions/write", { node: "B" });
      await wait(250);
      await runAction("/api/simulation/actions/read", { node: "A" });
      await wait(250);
      await runAction("/api/simulation/actions/read", { node: "B" });
      await wait(250);
      await runAction("/api/simulation/actions/heal");
      await wait(300);
      await loadSimulation();
    } catch {
    } finally {
      setDemoBusy(false);
    }
  }, [busy, demoBusy, isLoading, loadSimulation, runAction]);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between"
        style={{
          background: "rgba(6,13,26,0.92)",
          borderBottom: "1px solid rgba(14,165,233,0.12)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(["C", "A", "P"] as const).map((l, i) => {
              const colors = ["#38bdf8", "#fb923c", "#4ade80"];
              return (
                <div
                  key={l}
                  className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
                  style={{
                    background: `${colors[i]}18`,
                    border: `1px solid ${colors[i]}40`,
                    color: colors[i],
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                >
                  {l}
                </div>
              );
            })}
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "#e0eaff",
                letterSpacing: 0.3,
              }}
            >
              CAP Theorem Simulator
            </div>
            <div
              className="text-xs"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#374151",
                marginTop: -1,
              }}
            >
              Sistem Terdistribusi · Studi Kasus Interaktif
            </div>
          </div>
        </div>

        {/* Mode toggle + status */}
        <div className="flex items-center gap-3">
          <span
            className="text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "#374151" }}
          >
            MODE:
          </span>
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "#0c1528", border: "1px solid rgba(14,165,233,0.15)" }}
          >
            {(["CP", "AP"] as Mode[]).map((m) => {
              const active = mode === m;
              const col = m === "CP" ? "#38bdf8" : "#fb923c";
              return (
                <button
                  key={m}
                  onClick={() => changeMode(m)}
                  className="px-4 py-1.5 rounded-md text-xs font-bold transition-all duration-150"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: active ? `${col}20` : "transparent",
                    border: active ? `1px solid ${col}50` : "1px solid transparent",
                    color: active ? col : "#374151",
                    cursor: isLoading ? "not-allowed" : "pointer",
                  }}
                  disabled={isLoading}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <div
            className="px-3 py-1 rounded-full text-xs"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: net === "normal" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${net === "normal" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              color: net === "normal" ? "#4ade80" : "#f87171",
            }}
          >
            {net === "normal" ? "● NORMAL" : "⚡ PARTISI"}
          </div>
        </div>
      </header>

      {/* ── Tab nav ── */}
      <nav
        className="flex px-6"
        style={{ borderBottom: "1px solid rgba(14,165,233,0.08)" }}
      >
        {[
          { id: "sim" as TabId, label: "Simulasi" },
          { id: "theory" as TabId, label: "Teori CAP" },
          { id: "cases" as TabId, label: "Studi Kasus" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-5 py-3 text-sm font-medium transition-colors duration-150"
            style={{
              borderBottom: `2px solid ${tab === t.id ? "#38bdf8" : "transparent"}`,
              color: tab === t.id ? "#38bdf8" : "#6b7280",
              marginBottom: -1,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Page content ── */}
      <main className="p-6">
        {apiError && (
          <div
            className="mb-5 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#fca5a5",
            }}
          >
            {apiError}
          </div>
        )}
        {tab === "sim" && (
          <SimTab
            mode={mode}
            net={net}
            nodes={nodes}
            conns={conns}
            logs={logs}
            logRef={logRef}
            busy={busy}
            pendingAction={pendingAction}
            isLoading={isLoading}
            demoBusy={demoBusy}
            metrics={metrics}
            insights={insights}
            lastRead={lastRead}
            onPartition={triggerPartition}
            onHeal={healNetwork}
            onWriteA={writeToA}
            onWriteB={writeToB}
            onReadNode={readNode}
            onStartGuidedDemo={startGuidedDemo}
            onReset={reset}
          />
        )}
        {tab === "theory" && <TheoryTab />}
        {tab === "cases" && <CasesTab />}
      </main>
    </div>
  );
}
