const apiBase = (() => {
  const path = window.location.pathname;
  return path.endsWith('/') ? path : path + '/';
})();

function apiFetch(endpoint, options = {}) {
  const url = new URL(endpoint, window.location.origin + apiBase);
  return fetch(url.href, options);
}

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

export async function askAI(question, context = {}) {
  const res = await apiFetch('api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...context }),
  });
  return res.json();
}
