const API_BASE = '/c_learning/';

function joinUrl(base, endpoint) {
  // Ensure no double slashes and that endpoint never starts with a leading '/'
  const b = base.replace(/\/?$/, '');
  const e = endpoint.replace(/^\/+/, '');
  return b + '/' + e;
}

function apiFetch(endpoint, options = {}) {
  const base = window.location.origin + API_BASE;
  const url = joinUrl(base, endpoint);

  return fetch(url, {
    credentials: 'same-origin',
    ...options,
  });
}

async function parseResponse(resp) {
  // Try to parse JSON; if that fails, return text fallback
  const ct = resp.headers.get('Content-Type') || '';
  if (ct.indexOf('application/json') !== -1) {
    try {
      const j = await resp.json();
      return j;
    } catch (e) {
      return { success: false, error: 'invalid json response' };
    }
  }

  // fallback: text
  try {
    const t = await resp.text();
    // strip HTML if present
    const stripped = t.replace(/<[^>]+>/g, '').trim();
    return { success: resp.ok, error: stripped || (resp.ok ? null : 'error') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== 用户 ==========
export async function getMe() {
  const res = await apiFetch('api/me');
  return await parseResponse(res);
}

export async function login(username, password) {
  const res = await apiFetch('api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return await parseResponse(res);
}

export async function register(username, password) {
  const res = await apiFetch('api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return await parseResponse(res);
}

export async function logout() {
  const res = await apiFetch('api/logout', {
    method: 'POST',
  });
  return await parseResponse(res);
}

// ========== 编译 ==========
export async function checkCode(code, language) {
  const res = await apiFetch('api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language }),
  });
  return await parseResponse(res);
}

export async function compileCode(code, stdin, language) {
  const res = await apiFetch('api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, stdin, language }),
  });
  return await parseResponse(res);
}

// ========== 代码 ==========
export async function saveSnippet(title, language, code) {
  const res = await apiFetch('api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, language, code }),
  });
  return await parseResponse(res);
}

export async function listSnippets() {
  const res = await apiFetch('api/list');
  return await parseResponse(res);
}

export async function getSnippet(id) {
  const res = await apiFetch(`api/snippet?id=${encodeURIComponent(id)}`);
  return await parseResponse(res);
}

// ========== 课程（与课程编辑站共享） ==========
export async function listCourses() {
  const res = await apiFetch('api/courses');
  return await parseResponse(res);
}

export async function getCourse(id) {
  const res = await apiFetch(`api/course?id=${encodeURIComponent(id)}`);
  return await parseResponse(res);
}

// ========== AI ==========
export async function askAI(question, context = {}) {
  const res = await apiFetch('api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  return await parseResponse(res);
}