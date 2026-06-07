export async function checkCode(code, language) {
  const res = await fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language }),
  });
  return res.json();
}

export async function compileCode(code, stdin, language) {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, stdin, language }),
  });
  return res.json();
}

export async function saveSnippet(title, language, code) {
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, language, code }),
  });
  return res.json();
}

export async function listSnippets() {
  const res = await fetch('/api/list');
  return res.json();
}

export async function getSnippet(id) {
  const res = await fetch(`/api/snippet?id=${encodeURIComponent(id)}`);
  return res.json();
}
