// 백엔드 주소 — 다른 PC/폰에서 접속할 땐 PC의 LAN IP로 교체
// 예: "http://192.168.0.10:5000"
export const API_BASE = "http://localhost:5000";

const readLS = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};
const writeLS = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// fetch 래퍼 — 네트워크/503 에러면 throw
const request = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

// ───────── 상태 ─────────
export const getHealth = () => request("/api/health");

// ───────── Testcases ─────────
const TC_KEY = "qa_testcases";

export const fetchTestcases = async () => {
  try {
    const data = await request("/api/testcases");
    writeLS(TC_KEY, data); // 캐시
    return { data, source: "db" };
  } catch {
    return { data: readLS(TC_KEY), source: "local" };
  }
};

export const createTestcase = async (tc) => {
  try {
    const saved = await request("/api/testcases", { method: "POST", body: JSON.stringify(tc) });
    const local = readLS(TC_KEY);
    writeLS(TC_KEY, [...local, saved]);
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(TC_KEY);
    const newTC = {
      ...tc,
      id: `TC-${String(local.length + 1).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeLS(TC_KEY, [...local, newTC]);
    return { data: newTC, source: "local" };
  }
};

export const updateTestcase = async (id, patch) => {
  try {
    const saved = await request(`/api/testcases/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    const local = readLS(TC_KEY);
    writeLS(TC_KEY, local.map((t) => (t.id === id ? saved : t)));
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(TC_KEY);
    const updated = local.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t));
    writeLS(TC_KEY, updated);
    return { data: updated.find((t) => t.id === id), source: "local" };
  }
};

export const deleteTestcase = async (id) => {
  try {
    await request(`/api/testcases/${id}`, { method: "DELETE" });
  } catch { /* DB 없으면 로컬만 삭제 */ }
  const local = readLS(TC_KEY);
  writeLS(TC_KEY, local.filter((t) => t.id !== id));
};

export const bulkImportTestcases = async (rows) => {
  try {
    const saved = await request("/api/testcases/bulk", { method: "POST", body: JSON.stringify(rows) });
    const local = readLS(TC_KEY);
    writeLS(TC_KEY, [...local, ...saved]);
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(TC_KEY);
    const imported = rows.map((r, i) => ({
      ...r,
      id: `TC-${String(local.length + i + 1).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    writeLS(TC_KEY, [...local, ...imported]);
    return { data: imported, source: "local" };
  }
};

// ───────── Bugs ─────────
const BUG_KEY = "qa_bugs";

export const fetchBugs = async () => {
  try {
    const data = await request("/api/bugs");
    writeLS(BUG_KEY, data);
    return { data, source: "db" };
  } catch {
    return { data: readLS(BUG_KEY), source: "local" };
  }
};

export const createBug = async (bug) => {
  try {
    const saved = await request("/api/bugs", { method: "POST", body: JSON.stringify(bug) });
    const local = readLS(BUG_KEY);
    writeLS(BUG_KEY, [...local, saved]);
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(BUG_KEY);
    const newBug = {
      ...bug,
      id: `BUG-${String(local.length + 1).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeLS(BUG_KEY, [...local, newBug]);
    return { data: newBug, source: "local" };
  }
};

export const updateBug = async (id, patch) => {
  try {
    const saved = await request(`/api/bugs/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    const local = readLS(BUG_KEY);
    writeLS(BUG_KEY, local.map((b) => (b.id === id ? saved : b)));
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(BUG_KEY);
    const updated = local.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b));
    writeLS(BUG_KEY, updated);
    return { data: updated.find((b) => b.id === id), source: "local" };
  }
};

export const deleteBug = async (id) => {
  try { await request(`/api/bugs/${id}`, { method: "DELETE" }); } catch {}
  const local = readLS(BUG_KEY);
  writeLS(BUG_KEY, local.filter((b) => b.id !== id));
};

// ───────── Posts (게시판) ─────────
const POST_KEY = "qa_board_posts";

export const fetchPosts = async () => {
  try {
    const data = await request("/api/posts");
    writeLS(POST_KEY, data);
    return { data, source: "db" };
  } catch {
    return { data: readLS(POST_KEY), source: "local" };
  }
};

export const fetchPost = async (id) => {
  try {
    const data = await request(`/api/posts/${id}`);
    return { data, source: "db" };
  } catch {
    const posts = readLS(POST_KEY);
    return { data: posts.find((p) => String(p.id) === String(id)), source: "local" };
  }
};

export const createPost = async (post) => {
  try {
    const saved = await request("/api/posts", { method: "POST", body: JSON.stringify(post) });
    const local = readLS(POST_KEY);
    writeLS(POST_KEY, [saved, ...local]);
    return { data: saved, source: "db" };
  } catch {
    const local = readLS(POST_KEY);
    const maxId = local.reduce((m, p) => Math.max(m, p.id || 0), 0);
    const newPost = {
      ...post,
      id: maxId + 1,
      date: new Date().toISOString().slice(0, 10),
    };
    writeLS(POST_KEY, [...local, newPost]);
    return { data: newPost, source: "local" };
  }
};

export const deletePost = async (id) => {
  try { await request(`/api/posts/${id}`, { method: "DELETE" }); } catch {}
  const local = readLS(POST_KEY);
  writeLS(POST_KEY, local.filter((p) => String(p.id) !== String(id)));
};

// ───────── Utterances ─────────
export const fetchUtterances = async () => {
  try { return { data: await request("/api/utterances"), source: "db" }; }
  catch { return { data: [], source: "local" }; }
};

// ───────── URL → TC 자동 생성 ─────────
export const generateTCFromUrl = async (url, numTCs = 10) => {
  return request("/api/tc-from-url", {
    method: "POST",
    body: JSON.stringify({ url, numTCs }),
  });
};

// ───────── Report ─────────
export const fetchReportSummary = async ({ from, to } = {}) => {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  try { return { data: await request(`/api/report/summary?${q}`), source: "db" }; }
  catch { return { data: null, source: "local" }; }
};
