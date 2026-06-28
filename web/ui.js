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
  } else {
    userBar.innerHTML = `
      <span>未登录</span>
      <button id="login-btn">登录</button>
    `;
  }

  const logoutBtn = $('#logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await fetch('/c_learning/api/logout', { method: 'POST' });
      location.reload();
    };
  }

  const loginBtn = $('#login-btn');
  if (loginBtn) {
    loginBtn.onclick = () => {
      $('#auth-modal').classList.remove('hidden');
    };
  }
}

/* ================= 登录 ================= */
async function initAuth() {
  try {
    const res = await fetch('/c_learning/api/me');
    const me = await res.json();

    initAuthSwitch();

    if (me.success && me.authenticated) {
      updateUserBar(me.username);
      $('#app').classList.remove('hidden');
      startApp();
    } else {
      $('#auth-modal').classList.remove('hidden');
    }

  } catch (e) {
    // ✅ 防止白屏（你的关键问题）
    console.error(e);
    $('#app').classList.remove('hidden');
    startApp();
  }

  const submit = $('#auth-submit');

  submit.onclick = async () => {
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;

    if (!username || password.length < 6) {
      $('#auth-error').textContent = '用户名或密码不合法';
      return;
    }

    const mode = submit.dataset.mode || 'login';

    const url = mode === 'login'
      ? '/c_learning/api/login'
      : '/c_learning/api/register';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!data.success) {
      $('#auth-error').textContent = data.error;
      return;
    }

    updateUserBar(username);
    $('#auth-modal').classList.add('hidden');
    $('#app').classList.remove('hidden');

    startApp();
  };
}

/* ================= 登录切换 ================= */
function initAuthSwitch() {
  const switchBtn = $('#auth-switch');
  const submitBtn = $('#auth-submit');
  const title = $('#auth-title');
  const text = $('#auth-switch-text');

  if (!switchBtn) return;

  switchBtn.onclick = (e) => {
    e.preventDefault();

    const mode = submitBtn.dataset.mode;

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

/* ================= 主程序 ================= */
function startApp() {
  initEditor();
  initAI();
}

/* ================= 启动 ================= */
initAuth();