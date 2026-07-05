import { initEditor } from './editor.js';
import { getMe, login, register, logout, listCourses, getCourse } from './api.js';

function $(sel) {
  return document.querySelector(sel);
}

function renderInlineMd(raw) {
  let s = escapeHtml(raw || '');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+?)`/g, '<code>$1</code>');
  return s;
}

function renderCourseMarkdown(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  let html = '';
  let inCode = false;
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      closeLists();
      if (!inCode) {
        html += '<pre><code>';
        inCode = true;
      } else {
        html += '</code></pre>';
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeLists();
      html += '<p></p>';
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeLists();
      html += `<h3>${renderInlineMd(trimmed.slice(4))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeLists();
      html += `<h2>${renderInlineMd(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeLists();
      html += `<h1>${renderInlineMd(trimmed.slice(2))}</h1>`;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inUl) {
        closeLists();
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${renderInlineMd(trimmed.replace(/^[-*]\s+/, ''))}</li>`;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inOl) {
        closeLists();
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${renderInlineMd(trimmed.replace(/^\d+\.\s+/, ''))}</li>`;
      continue;
    }

    closeLists();
    html += `<p>${renderInlineMd(trimmed)}</p>`;
  }

  closeLists();
  if (inCode) {
    html += '</code></pre>';
  }
  return html || '<p>暂无课程内容</p>';
}

function initCourseReader() {
  const modal = $('#course-reader-modal');
  const panel = $('#course-reader-panel');
  const closeBtn = $('#course-reader-close');

  if (!modal || !panel || !closeBtn) return;

  closeBtn.onclick = () => {
    if (document.fullscreenElement === panel) {
      document.exitFullscreen().catch(() => {});
    }
    modal.classList.add('hidden');
  };

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeBtn.click();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden') && document.fullscreenElement !== panel) {
      modal.classList.add('hidden');
    }
  });
}

function openCourseReaderShell() {
  const modal = $('#course-reader-modal');
  const title = $('#course-reader-title');
  const meta = $('#course-reader-meta');
  const body = $('#course-reader-body');
  const panel = $('#course-reader-panel');
  if (!modal || !title || !meta || !body || !panel) return;

  title.textContent = '课程加载中';
  meta.textContent = '';
  body.textContent = '正在加载课程内容...';
  modal.classList.remove('hidden');
  panel.requestFullscreen?.().catch(() => {});
}

function showCourseReader(item) {
  const modal = $('#course-reader-modal');
  const title = $('#course-reader-title');
  const meta = $('#course-reader-meta');
  const body = $('#course-reader-body');
  if (!modal || !title || !meta || !body) return;

  title.textContent = item.title || '未命名课程';
  meta.textContent = item.created_at ? `创建时间：${item.created_at.replace('T', ' ').replace('Z', '')}` : '课程详情';
  body.innerHTML = renderCourseMarkdown(item.text || '暂无课程内容');
  modal.classList.remove('hidden');
}

/* ================= 用户栏 ================= */
function updateUserBar(username) {
  const userBar = $('#user-bar');
  if (!userBar) return;

  if (username) {
    userBar.innerHTML = `
      <span>当前用户：${username}</span>
      <button id="logout-btn">退出登录</button>
    `;

    const logoutBtn = $('#logout-btn');
    logoutBtn.onclick = async () => {
      await logout();
      location.reload();
    };
  } else {
    userBar.innerHTML = `
      <span>未登录</span>
      <button id="login-btn">登录</button>
    `;

    const loginBtn = $('#login-btn');
    loginBtn.onclick = () => {
      $('#auth-modal')?.classList.remove('hidden');
    };
  }
}

/* ================= 登录切换 ================= */
function initAuthSwitch() {
  const switchBtn = $('#auth-switch');
  const submitBtn = $('#auth-submit');
  const title = $('#auth-title');
  const text = $('#auth-switch-text');

  if (!switchBtn || !submitBtn || !title || !text) return;

  switchBtn.onclick = (e) => {
    e.preventDefault();

    const mode = submitBtn.dataset.mode || 'login';

    if (mode === 'login') {
      submitBtn.dataset.mode = 'register';
      submitBtn.textContent = '注册';
      title.textContent = '注册';
      text.textContent = '已有账号？';
      switchBtn.textContent = '去登录';
    } else {
      submitBtn.dataset.mode = 'login';
      submitBtn.textContent = '登录';
      title.textContent = '登录';
      text.textContent = '没有账号？';
      switchBtn.textContent = '去注册';
    }
  };
}

function escapeHtml(text) {
  const value = String(text || '');
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mapCourseToCard(course, idx) {
  const palette = ['#bf5a36', '#2a5a9f', '#007acc', '#2ea44f', '#343a40', '#e0a106'];
  const color = palette[idx % palette.length];
  const title = course.title || '未命名课程';
  return {
    id: course.id,
    title,
    icon: title.slice(0, 2).toUpperCase(),
    tags: ['课程编辑站同步'],
    color,
    desc: '该课程由课程编辑站创建，可在学习站查看与进入学习。',
    stats: course.created_at ? `创建于 ${course.created_at.replace('T', ' ').replace('Z', '')}` : '已发布课程',
  };
}

/* ================= 渲染课程列表 ================= */
async function renderCourses() {
  const grid = $('#course-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="course-empty">课程加载中...</div>';

  let cards = [];
  try {
    const data = await listCourses();
    if (data?.success && Array.isArray(data.items)) {
      cards = data.items.map(mapCourseToCard);
    }
  } catch (err) {
    console.error('load courses failed:', err);
  }

  if (!cards.length) {
    grid.innerHTML = '<div class="course-empty">暂无课程，请先到课程编辑站创建课程。</div>';
    return;
  }

  grid.innerHTML = cards.map(course => {
    const tagsHtml = course.tags.map(tag => `<span class="course-tag">${tag}</span>`).join('');
    const iconColor = course.color || 'var(--accent)';
    
    return `
      <div class="course-card" data-course-id="${escapeHtml(course.id)}">
        <div class="course-card-top">
          <div class="course-logo" style="background: ${iconColor}1a; color: ${iconColor}; border: 1px solid ${iconColor}33;">
            ${escapeHtml(course.icon)}
          </div>
          <div class="course-tag-row">
            ${tagsHtml}
          </div>
        </div>
        <h3 class="course-title">${escapeHtml(course.title)}</h3>
        <p class="course-description">${escapeHtml(course.desc)}</p>
        <div class="course-footer">
          <span class="course-meta">${escapeHtml(course.stats)}</span>
          <button class="course-btn" data-open-course="${escapeHtml(course.id)}" style="background: linear-gradient(135deg, ${iconColor}, ${iconColor}dd); box-shadow: 0 8px 20px ${iconColor}22;">
            立即学习
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-open-course]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-open-course');
      if (!id) return;
      openCourseReaderShell();
      try {
        const detail = await getCourse(id);
        if (detail?.success && detail.item) {
          showCourseReader(detail.item);
          return;
        }
      } catch (err) {
        console.error('open course failed:', err);
      }
      alert('课程加载失败，请稍后重试。');
    });
  });
}

/* ================= 主程序 ================= */
async function startApp() {
  initEditor();
  initCourseReader();
  await renderCourses();
}

/* ================= 初始化认证 ================= */
async function initAuth() {
  initAuthSwitch();

  try {
    const me = await getMe();

    if (me.success && me.authenticated) {
      updateUserBar(me.username);
      $('#auth-modal')?.classList.add('hidden');
      $('#app')?.classList.remove('hidden');
      startApp();
    } else {
      updateUserBar(null);
      $('#auth-modal')?.classList.remove('hidden');
    }
  } catch (e) {
    console.error('initAuth error:', e);
    updateUserBar(null);
    $('#auth-modal')?.classList.remove('hidden');
  }

  const submit = $('#auth-submit');
  if (!submit) return;

  submit.onclick = async () => {
    const username = $('#auth-username')?.value.trim();
    const password = $('#auth-password')?.value || '';

    if (!username || password.length < 6) {
      $('#auth-error').textContent = '用户名不能为空，密码至少 6 位';
      return;
    }

    const mode = submit.dataset.mode || 'login';
    let data;

    try {
      data = mode === 'login'
        ? await login(username, password)
        : await register(username, password);
    } catch (e) {
      $('#auth-error').textContent = '请求失败：' + e.message;
      return;
    }

    if (!data.success) {
      $('#auth-error').textContent = data.error || '操作失败';
      return;
    }

    // 注册成功后自动登录一次
    if (mode === 'register') {
      const loginRes = await login(username, password);
      if (!loginRes.success) {
        $('#auth-error').textContent = loginRes.error || '注册成功，但自动登录失败';
        return;
      }
    }

    updateUserBar(username);
    $('#auth-error').textContent = '';
    $('#auth-modal')?.classList.add('hidden');
    $('#app')?.classList.remove('hidden');
    startApp();
  };
}

initAuth();
``