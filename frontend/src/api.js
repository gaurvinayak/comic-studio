import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8004";

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  headers: { "Content-Type": "application/json" },
});

// Multi-user-ready seam: attach a bearer token if one is ever stored. Today the
// backend runs single-user, so this is a no-op.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("session_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, drop the stale token and bounce to login (unless already there).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("session_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const setSessionToken = (t) => {
  if (t) localStorage.setItem("session_token", t);
  else localStorage.removeItem("session_token");
};
export const getSessionToken = () => localStorage.getItem("session_token");

/** Turn a backend asset path ("/api/assets/xxx") into an absolute URL. */
export const assetUrl = (path) => (path ? `${BACKEND_URL}${path}` : null);

export const seriesAPI = {
  list: () => api.get("/series"),
  create: (theme, hint) => api.post("/series", { theme, hint }),
  get: (id) => api.get(`/series/${id}`),
  update: (id, data) => api.patch(`/series/${id}`, data),
  remove: (id) => api.delete(`/series/${id}`),
  generateCover: (id) => api.post(`/series/${id}/generate-cover`, {}),
};

export const charactersAPI = {
  get: (id) => api.get(`/characters/${id}`),
  add: (seriesId, body) => api.post(`/series/${seriesId}/characters`, body),
  update: (id, data) => api.patch(`/characters/${id}`, data),
  remove: (id) => api.delete(`/characters/${id}`),
  generatePortrait: (id) => api.post(`/characters/${id}/generate-portrait`, {}),
  setPortrait: (id, assetId) => api.post(`/characters/${id}/set-portrait`, { asset_id: assetId }),
  lock: (id) => api.post(`/characters/${id}/lock`, {}),
  unlock: (id) => api.post(`/characters/${id}/unlock`, {}),
};

export const partsAPI = {
  list: (seriesId) => api.get(`/series/${seriesId}/parts`),
  generate: (seriesId, direction) => api.post(`/series/${seriesId}/parts`, { direction }),
  get: (partId) => api.get(`/parts/${partId}`),
  remove: (partId) => api.delete(`/parts/${partId}`),
  getPanel: (panelId) => api.get(`/panels/${panelId}`),
  updatePanel: (panelId, data) => api.patch(`/panels/${panelId}`, data),
  generatePanelArt: (panelId) => api.post(`/panels/${panelId}/generate-art`, {}),
  setPanelArt: (panelId, assetId) => api.post(`/panels/${panelId}/set-art`, { asset_id: assetId }),
  generateAllArt: (partId) => api.post(`/parts/${partId}/generate-art`, {}),
  composeAll: (partId) => api.post(`/parts/${partId}/compose`, {}),
  exportPdf: (partId) => api.post(`/parts/${partId}/export-pdf`, {}),
  publish: (partId) => api.post(`/parts/${partId}/publish`, {}),
  unpublish: (partId) => api.post(`/parts/${partId}/unpublish`, {}),
};

export const showcaseAPI = {
  list: () => api.get("/showcase"),
  get: (slug) => api.get(`/showcase/${slug}`),
};

export const pagesAPI = {
  compose: (pageId) => api.post(`/pages/${pageId}/compose`, {}),
  setLayout: (pageId, template) => api.post(`/pages/${pageId}/layout`, { template }),
  setCustomLayout: (pageId, cells) => api.post(`/pages/${pageId}/custom-layout`, { cells }),
};

export const jobsAPI = {
  get: (id) => api.get(`/jobs/${id}`),
};

export const healthAPI = {
  get: () => api.get("/health"),
};

export const usageAPI = {
  get: () => api.get("/usage"),
};

export const authAPI = {
  register: (email, password, name) => api.post("/auth/register", { email, password, name }),
  login: (email, password) => api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
};

/** Poll a job until it finishes (or times out). Calls onTick(job) each poll. */
export async function pollJob(jobId, { onTick, interval = 2000, timeout = 180000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await jobsAPI.get(jobId);
    if (onTick) onTick(data);
    if (data.status === "done" || data.status === "error") return data;
    if (Date.now() - start > timeout) throw new Error("Generation timed out");
    await new Promise((r) => setTimeout(r, interval));
  }
}

export default api;
