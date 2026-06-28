import { initEditor } from './editor.js';
import { courses } from './data.js';
import { getMe, login, register, logout } from './api.js';

function $(sel) {
  return document.querySelector(sel);
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

/* ================= 渲染课程列表 ================= */
function renderCourses() {
  const grid = $('#course-grid');
  if (!grid) return;

  grid.innerHTML = courses.map(course => {
    const tagsHtml = course.tags.map(tag => `<span class="course-tag">${tag}</span>`).join('');
    const iconColor = course.color || 'var(--accent)';
    
    return `
      <div class="course-card">
        <div class="course-card-top">
          <div class="course-logo" style="background: ${iconColor}1a; color: ${iconColor}; border: 1px solid ${iconColor}33;">
            ${course.icon}
          </div>
          <div class="course-tag-row">
            ${tagsHtml}
          </div>
        </div>
        <h3 class="course-title">${course.title}</h3>
        <p class="course-description">${course.desc}</p>
        <div class="course-footer">
          <span class="course-meta">${course.stats}</span>
          <button class="course-btn" style="background: linear-gradient(135deg, ${iconColor}, ${iconColor}dd); box-shadow: 0 8px 20px ${iconColor}22;" onclick="alert('已开启【${course.title}】的课程订阅，现在开始进入学习大纲！')">
            立即学习
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* ================= 主程序 ================= */
function startApp() {
  initEditor();
  renderCourses();
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