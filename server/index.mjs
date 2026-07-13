import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";

const D0 = "Rp 1.000.000";
const D1 = "Rp 1.500.000";
const NODE_IDS = ["A", "B", "C"];

let nextLogId = 1;
let pendingTimer = null;

function now() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createLog(text, kind = "info") {
  return {
    id: nextLogId++,
    time: now(),
    text,
    kind,
  };
}

function baseNodes() {
  return {
    A: { value: D0, version: 1, status: "active" },
    B: { value: D0, version: 1, status: "active" },
    C: { value: D0, version: 1, status: "active" },
  };
}

function baseConns() {
  return { AB: true, AC: true, BC: true };
}

function baseMetrics() {
  return {
    totalWrites: 0,
    acceptedWrites: 0,
    rejectedWrites: 0,
    totalReads: 0,
    staleReads: 0,
    partitionsTriggered: 0,
    healOperations: 0,
    modeChanges: 0,
    syncEvents: 0,
  };
}

const state = {
  mode: "CP",
  net: "normal",
  nodes: baseNodes(),
  conns: baseConns(),
  logs: [createLog("Sistem terdistribusi siap. 3 node terhubung penuh.", "ok")],
  busy: false,
  pendingAction: null,
  metrics: baseMetrics(),
  lastRead: null,
};

const projectInfo = {
  title: "CAP Theorem Simulation App",
  assignment: "Tugas 4 - Scalable Systems Design",
  student: {
    name: "RIFKI NUR FAHREZI AHMAD",
    nim: "105841104723",
  },
  architecture: {
    frontend: "React + Vite single-page application",
    backend: "Node.js HTTP API with in-memory CAP simulation engine",
    deployment: "Single-container Docker image serving API and built frontend",
  },
};

function snapshot() {
  return {
    mode: state.mode,
    net: state.net,
    nodes: structuredClone(state.nodes),
    conns: { ...state.conns },
    logs: structuredClone(state.logs),
    busy: state.busy,
    pendingAction: state.pendingAction,
    metrics: structuredClone(state.metrics),
    lastRead: state.lastRead ? { ...state.lastRead } : null,
    insights: buildInsights(),
  };
}

function setNodes(nextNodes) {
  state.nodes = nextNodes;
}

function patchNodes(updates) {
  for (const [nodeId, patch] of Object.entries(updates)) {
    state.nodes[nodeId] = { ...state.nodes[nodeId], ...patch };
  }
}

function addLog(text, kind = "info") {
  state.logs = [...state.logs.slice(-59), createLog(text, kind)];
}

function clearPendingTransition() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  state.busy = false;
  state.pendingAction = null;
}

function scheduleTransition(delayMs, label, callback) {
  clearPendingTransition();
  state.busy = true;
  state.pendingAction = label;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    try {
      callback();
    } finally {
      state.busy = false;
      state.pendingAction = null;
    }
  }, delayMs);

  return delayMs;
}

function latestVersion() {
  return Math.max(state.nodes.A.version, state.nodes.B.version, state.nodes.C.version);
}

function latestValue() {
  const entries = Object.values(state.nodes);
  const newest = entries.reduce((current, node) => {
    if (node.version > current.version) {
      return node;
    }

    return current;
  }, entries[0]);

  return newest?.value || D0;
}

function getNodeIdsBy(predicate) {
  return NODE_IDS.filter((nodeId) => predicate(state.nodes[nodeId], nodeId));
}

function calculateReadLatency(nodeId, isStale) {
  const baseLatency = state.net === "normal" ? 34 : state.mode === "CP" ? 86 : 42;
  const nodeOffset = { A: 4, B: 9, C: 12 }[nodeId] || 0;
  return baseLatency + nodeOffset + (isStale ? 18 : 0);
}

function buildInsights() {
  const newestVersion = latestVersion();
  const newestValue = latestValue();
  const staleNodes = getNodeIdsBy((node) => node.status === "stale" || node.version < newestVersion || node.value !== newestValue);
  const blockedNodes = getNodeIdsBy((node) => node.status === "blocked");
  const syncingNodes = getNodeIdsBy((node) => node.status === "syncing");
  const freshestNodes = getNodeIdsBy((node) => node.version === newestVersion && node.value === newestValue);
  const divergenceCount = staleNodes.length;
  const availabilityScore = state.metrics.totalWrites === 0
    ? 100
    : Math.round((state.metrics.acceptedWrites / state.metrics.totalWrites) * 100);
  const readFreshnessScore = state.metrics.totalReads === 0
    ? 100
    : Math.round(((state.metrics.totalReads - state.metrics.staleReads) / state.metrics.totalReads) * 100);
  const consistencyScore = Math.max(0, readFreshnessScore - divergenceCount * 10);

  let clusterHealth = "Healthy";
  if (syncingNodes.length > 0 || state.busy) {
    clusterHealth = "Converging";
  } else if (state.net === "partitioned" && divergenceCount > 0) {
    clusterHealth = "Diverged";
  } else if (state.net === "partitioned") {
    clusterHealth = "Partitioned";
  } else if (divergenceCount > 0) {
    clusterHealth = "Degraded";
  }

  let recommendation = "Cluster sehat. Gunakan write atau read untuk melihat perilaku sistem.";
  if (state.net === "partitioned" && state.mode === "CP") {
    recommendation = "Mode CP sedang melindungi konsistensi. Coba write untuk melihat request ditolak demi menjaga data tetap seragam.";
  } else if (state.net === "partitioned" && state.mode === "AP" && divergenceCount > 0) {
    recommendation = "Mode AP sedang memprioritaskan availability. Lakukan read pada node berbeda untuk membuktikan adanya stale read.";
  } else if (syncingNodes.length > 0) {
    recommendation = "Sinkronisasi sedang berlangsung. Perhatikan bagaimana divergensi turun saat jaringan pulih.";
  }

  return {
    clusterHealth,
    divergenceCount,
    staleNodes,
    blockedNodes,
    syncingNodes,
    freshestNodes,
    latestVersion: newestVersion,
    latestValue: newestValue,
    consistencyScore,
    availabilityScore,
    tradeoffFocus: state.mode === "CP" ? "Data correctness first" : "Service continuity first",
    recommendation,
  };
}

function conflictResponse(message) {
  addLog(`⏳ ${message}`, "warn");
  return {
    statusCode: 409,
    body: {
      ok: false,
      message,
      state: snapshot(),
    },
  };
}

function ensureNotBusy(message) {
  if (state.busy) {
    return conflictResponse(message);
  }

  return null;
}

function actionResponse(message, syncAfterMs = null) {
  return {
    statusCode: 200,
    body: {
      ok: true,
      message,
      state: snapshot(),
      syncAfterMs,
    },
  };
}

function setMode(mode) {
  if (!["CP", "AP"].includes(mode)) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Mode harus CP atau AP." },
    };
  }

  if (state.mode !== mode) {
    state.metrics.modeChanges += 1;
    addLog(`Mode simulasi diubah ke ${mode}.`, "info");
  }

  state.mode = mode;
  return actionResponse(`Mode diubah ke ${mode}.`);
}

function triggerPartition() {
  const busy = ensureNotBusy("Transisi sebelumnya masih berjalan. Tunggu sampai selesai sebelum memicu partisi.");
  if (busy) return busy;

  if (state.net === "partitioned") {
    return actionResponse("Jaringan sudah berada pada kondisi partition.");
  }

  state.net = "partitioned";
  state.conns = { AB: false, AC: false, BC: true };
  state.metrics.partitionsTriggered += 1;
  addLog("⚡ Network partition terjadi! Node A terisolasi dari B dan C.", "err");
  addLog("Koneksi A↔B: PUTUS | A↔C: PUTUS | B↔C: AKTIF", "warn");
  addLog(`Mode aktif: ${state.mode} — coba Write untuk melihat efeknya.`, "info");
  return actionResponse("Network partition berhasil dipicu.");
}

function healNetwork() {
  const busy = ensureNotBusy("Transisi sebelumnya masih berjalan. Tunggu sampai sinkronisasi selesai.");
  if (busy) return busy;

  if (state.net === "normal") {
    return actionResponse("Jaringan sudah normal.");
  }

  state.net = "normal";
  state.conns = baseConns();
  state.metrics.healOperations += 1;
  addLog("Jaringan pulih. Memulai sinkronisasi...", "info");

  const version = latestVersion();
  const value = latestValue();
  setNodes({
    A: { value, version, status: "syncing" },
    B: { value, version, status: "syncing" },
    C: { value, version, status: "syncing" },
  });

  const syncAfterMs = scheduleTransition(1200, "sinkronisasi jaringan", () => {
    patchNodes({
      A: { status: "active" },
      B: { status: "active" },
      C: { status: "active" },
    });
    state.metrics.syncEvents += 1;
    addLog("✅ Semua node tersinkron dengan data terbaru!", "ok");
  });

  return actionResponse("Pemulihan jaringan dimulai.", syncAfterMs);
}

function writeToNode(nodeId) {
  if (!["A", "B"].includes(nodeId)) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Node tujuan harus A atau B." },
    };
  }

  const busy = ensureNotBusy("Transisi sebelumnya masih berjalan. Tunggu sebelum mengirim write berikutnya.");
  if (busy) return busy;

  state.metrics.totalWrites += 1;
  addLog(`📝 Write request → Node ${nodeId}: ${D0} → ${D1}`, "info");

  if (state.net === "normal") {
    state.metrics.acceptedWrites += 1;
    patchNodes({
      A: { status: "syncing" },
      B: { status: "syncing" },
      C: { status: "syncing" },
    });

    const syncAfterMs = scheduleTransition(700, "replikasi write", () => {
      setNodes({
        A: { value: D1, version: 2, status: "active" },
        B: { value: D1, version: 2, status: "active" },
        C: { value: D1, version: 2, status: "active" },
      });
      state.metrics.syncEvents += 1;
      addLog("✅ Write berhasil! Data tersebar ke semua 3 node.", "ok");
    });

    return actionResponse(`Write ke Node ${nodeId} diproses.`, syncAfterMs);
  }

  if (state.mode === "CP") {
    state.metrics.rejectedWrites += 1;
    patchNodes({ [nodeId]: { status: "blocked" } });

    if (nodeId === "A") {
      addLog("🔴 [CP] Node A tidak bisa konfirmasi ke Node B & C.", "err");
    } else {
      addLog("🔴 [CP] Node B tidak bisa konfirmasi ke Node A (terpartisi).", "err");
    }

    addLog("🔴 [CP] Write DITOLAK — sistem menjaga Consistency.", "err");
    const syncAfterMs = scheduleTransition(1600, `pemulihan node ${nodeId}`, () => {
      patchNodes({ [nodeId]: { status: "active" } });
    });

    return actionResponse(`Write ke Node ${nodeId} ditolak karena mode CP.`, syncAfterMs);
  }

  if (nodeId === "A") {
    state.metrics.acceptedWrites += 1;
    addLog("🟡 [AP] Node A menerima write meski terpartisi.", "warn");
    patchNodes({
      A: { value: D1, version: 2, status: "active" },
      B: { status: "stale" },
      C: { status: "stale" },
    });
    addLog("✅ [AP] Write diterima di Node A (v2). B & C masih data lama.", "ok");
    return actionResponse("Write AP ke Node A diterima.");
  }

  state.metrics.acceptedWrites += 1;
  patchNodes({
    B: { status: "syncing" },
    C: { status: "syncing" },
  });

  const syncAfterMs = scheduleTransition(800, "sinkronisasi B ke C", () => {
    patchNodes({
      B: { value: D1, version: 2, status: "active" },
      C: { value: D1, version: 2, status: "active" },
      A: { status: "stale" },
    });
    state.metrics.syncEvents += 1;
    addLog("🟡 [AP] Node B menyinkron ke C (B↔C masih aktif).", "warn");
    addLog("✅ [AP] Write diterima di Node B & C. Node A masih data lama.", "ok");
  });

  return actionResponse("Write AP ke Node B diproses.", syncAfterMs);
}

function readFromNode(nodeId) {
  if (!NODE_IDS.includes(nodeId)) {
    return {
      statusCode: 400,
      body: { ok: false, message: "Node read harus A, B, atau C." },
    };
  }

  const busy = ensureNotBusy("Transisi sebelumnya masih berjalan. Tunggu sebelum melakukan read berikutnya.");
  if (busy) return busy;

  const node = state.nodes[nodeId];
  const newestVersion = latestVersion();
  const newestValue = latestValue();
  const isStale = node.version < newestVersion || node.value !== newestValue || node.status === "stale";
  const latencyMs = calculateReadLatency(nodeId, isStale);
  const consistencyLabel = isStale
    ? "STALE READ"
    : state.net === "partitioned"
      ? "CONSISTENT UNDER PARTITION"
      : "STRONG READ";
  const explanation = isStale
    ? `Node ${nodeId} belum menerima update terbaru. Ini menunjukkan konsekuensi availability pada mode AP.`
    : state.net === "partitioned"
      ? `Node ${nodeId} masih memberikan data konsisten untuk state saat ini meski jaringan terpartisi.`
      : `Node ${nodeId} memberikan data terbaru yang seragam dengan seluruh cluster.`;

  state.metrics.totalReads += 1;
  if (isStale) {
    state.metrics.staleReads += 1;
  }

  state.lastRead = {
    node: nodeId,
    value: node.value,
    version: node.version,
    isStale,
    latencyMs,
    consistencyLabel,
    explanation,
    latestVersion: newestVersion,
    time: now(),
  };

  addLog(`🔍 Read → Node ${nodeId} mengembalikan ${node.value} (v${node.version}) dalam ~${latencyMs}ms.`, isStale ? "warn" : "ok");
  if (isStale) {
    addLog(`🟡 Node ${nodeId} masih tertinggal dari versi terbaru v${newestVersion}.`, "warn");
  } else if (state.net === "partitioned" && state.mode === "CP") {
    addLog("🔵 [CP] Read tetap konsisten walau jaringan sedang terpartisi.", "info");
  } else if (state.net === "partitioned" && state.mode === "AP") {
    addLog(`🟠 [AP] Read pada Node ${nodeId} tetap tersedia selama partisi.`, "info");
  }

  return actionResponse(`Read dari Node ${nodeId} selesai.`);
}

function resetSimulation() {
  clearPendingTransition();
  state.net = "normal";
  state.conns = baseConns();
  state.nodes = baseNodes();
  state.metrics = baseMetrics();
  state.lastRead = null;
  state.logs = [createLog("Simulasi direset ke kondisi awal.", "ok")];

  const syncAfterMs = scheduleTransition(50, "reset simulasi", () => {
    addLog(`✅ 3 node terhubung kembali. Data: ${D0}`, "ok");
  });

  return actionResponse("Simulasi berhasil direset.", syncAfterMs);
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request body terlalu besar."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body harus berupa JSON yang valid."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
  }[ext] || "application/octet-stream";
}

async function serveBuiltAsset(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let safePath = decodeURIComponent(requestUrl.pathname);

  if (safePath === "/") {
    const html = await fs.readFile(INDEX_FILE);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  safePath = safePath.replace(/^\/+/, "");
  const assetPath = path.join(DIST_DIR, safePath);

  if (!assetPath.startsWith(DIST_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(assetPath);
    if (stat.isFile()) {
      const buffer = await fs.readFile(assetPath);
      response.writeHead(200, { "Content-Type": contentType(assetPath) });
      response.end(buffer);
      return;
    }
  } catch {
  }

  const html = await fs.readFile(INDEX_FILE);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

async function handleApi(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      status: "healthy",
      service: "cap-theorem-simulator-api",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/info") {
    sendJson(response, 200, { ok: true, info: projectInfo });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/simulation") {
    sendJson(response, 200, { ok: true, state: snapshot() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/mode") {
    const body = await readJsonBody(request);
    const result = setMode(body.mode);
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/actions/partition") {
    const result = triggerPartition();
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/actions/heal") {
    const result = healNetwork();
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/actions/write") {
    const body = await readJsonBody(request);
    const result = writeToNode(body.node);
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/actions/read") {
    const body = await readJsonBody(request);
    const result = readFromNode(body.node);
    sendJson(response, result.statusCode, result.body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/simulation/actions/reset") {
    const result = resetSimulation();
    sendJson(response, result.statusCode, result.body);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    message: "Endpoint tidak ditemukan.",
  });
}

async function createRequestListener() {
  if (!isProduction) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: ROOT_DIR,
      appType: "spa",
      server: {
        middlewareMode: true,
      },
    });

    return (request, response) => {
      if ((request.url || "").startsWith("/api/")) {
        handleApi(request, response).catch((error) => {
          sendJson(response, 500, { ok: false, message: error.message || "Terjadi kesalahan server." });
        });
        return;
      }

      vite.middlewares(request, response, (error) => {
        if (error) {
          vite.ssrFixStacktrace(error);
          sendJson(response, 500, { ok: false, message: error.message || "Gagal memproses request." });
          return;
        }

        response.writeHead(404);
        response.end("Not Found");
      });
    };
  }

  return (request, response) => {
    if ((request.url || "").startsWith("/api/")) {
      handleApi(request, response).catch((error) => {
        sendJson(response, 500, { ok: false, message: error.message || "Terjadi kesalahan server." });
      });
      return;
    }

    serveBuiltAsset(request, response).catch((error) => {
      sendJson(response, 500, { ok: false, message: error.message || "Gagal menyajikan aplikasi." });
    });
  };
}

const listener = await createRequestListener();

http
  .createServer(listener)
  .listen(PORT, () => {
    const mode = isProduction ? "production" : "development";
    console.log(`CAP Theorem Simulator berjalan di http://localhost:${PORT} (${mode})`);
  });