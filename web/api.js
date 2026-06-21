const apiBase = (() => {
  const path = window.location.pathname;
  return path.endsWith('/') ? path : path + '/';
})();

const API_BASE = '/c_learning/';

function apiFetch(endpoint, options = {}) {
  const url = new URL(endpoint, window.location.origin + apiBase);

  return fetch(url.href, {
    credentials: 'same-origin',
    ...options,
  });
}

// ========== 用户 ==========
export async function getMe() {
  const res = await apiFetch('api/me');
  return res.json();
}

export async function login(username, password) {
  const res = await apiFetch('api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function register(username, password) {
  const res = await apiFetch('api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

// ✅ 修复：不要写死路径
export async function logout() {
  const res = await apiFetch('api/logout', {
    method: 'POST',
  });
  return res.json();
}

// ========== 编译 ==========
export async function checkCode(code, language) {
  const res = await apiFetch('api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language }),
  });
  return res.json();
}

export async function compileCode(code, stdin, language) {
  const res = await apiFetch('api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, stdin, language }),
  });
  return res.json();
}

// ========== 代码 ==========
export async function saveSnippet(title, language, code) {
  const res = await apiFetch('api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, language, code }),
  });
  return res.json();
}

export async function listSnippets() {
  const res = await apiFetch('api/list');
  return res.json();
}

export async function getSnippet(id) {
  const res = await apiFetch(`api/snippet?id=${encodeURIComponent(id)}`);
  return res.json();
}

// ✅ 修复：AI 参数结构正确
export async function askAI(question, context = {}) {
  const res = await apiFetch('api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      context, // ✅ 关键修复
    }),
  });
  return res.json();
}