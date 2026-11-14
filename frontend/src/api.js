// Set VITE_API_URL when building for a deployed API.
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

const TOKEN_KEY = "gurucool_token";

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  save(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// FastAPI returns `detail` as a string, or as a list of validation errors.
function readError(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const message = typeof detail[0] === "string" ? detail[0] : detail[0]?.msg;
    if (message) return message.replace(/^Value error,\s*/, "");
  }
  return fallback;
}

export async function api(path, { method = "GET", body, form, headers = {}, raw = false } = {}) {
  const token = session.token;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("The server cannot be reached. Check your connection and try again.", 0);
  }
  if (response.status === 401 && token) {
    session.clear();
    window.dispatchEvent(new Event("gurucool:signed-out"));
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(
      readError(payload, "Something went wrong. Try again."),
      response.status,
      Number(response.headers.get("Retry-After")) || undefined,
    );
  }
  if (raw) return response;
  return response.status === 204 ? null : response.json();
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Upload with progress: fetch cannot report upload progress, XMLHttpRequest can.
export function uploadPdf(file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/documents/upload`);
    const token = session.token;
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Idempotency-Key", crypto.randomUUID());
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new ApiError("The server cannot be reached. Check your connection and try again.", 0));
    request.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        // Not JSON; the status decides.
      }
      if (request.status === 401 && token) {
        session.clear();
        window.dispatchEvent(new Event("gurucool:signed-out"));
      }
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else {
        reject(
          new ApiError(
            readError(payload, "The upload did not work. Try again."),
            request.status,
            Number(request.getResponseHeader("Retry-After")) || undefined,
          ),
        );
      }
    };
    request.send(form);
  });
}

export async function waitForDocument(id, onProgress) {
  for (;;) {
    const document = await api(`/documents/${id}`);
    if (document.status === "completed" || document.status === "failed") return document;
    onProgress?.(document);
    await wait(1500);
  }
}
