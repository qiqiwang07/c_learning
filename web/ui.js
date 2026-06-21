import {
  exercises, languages, hints,
  getExerciseTemplate, getFileExtension, getPlaceholderText
} from './data.js';

import { state } from './state.js';

import {
  initEditor, updateEditorMode,
  setCode, setEditorReadOnly, getCode
} from './editor.js';

import {
  checkCode, compileCode, saveSnippet,
  listSnippets, getSnippet,
  getMe, login, register, logout
} from './api.js';

import { initAI } from './ai.js';

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
      <button id="logout-btn" class="secondary-btn">退出登录</button>
    `;
  } else {
    userBar.innerHTML = `
      <span>未登录</span>
      <button id="login-btn" class="secondary-btn">登录</button>
    `;
  }

  const logoutBtn = $('#logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await logout();
      updateUserBar(null);
      location.reload();
    };
  }

  const loginBtn = $('#login-btn');
  if (loginBtn) {
    loginBtn.onclick = () => $('#auth-modal').classList.remove('hidden');
  }
}

/* ================= 登录 ================= */
async function initAuth() {
  const me = await getMe();

  if (me.success && me.authenticated) {
    updateUserBar(me.username);
    $('#app').classList.remove('hidden');
  } else {
    $('#auth-modal').classList.remove('hidden');
  }

  $('#auth-submit').onclick = async () => {
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;

    if (!username || password.length < 6) {
      $('#auth-error').textContent = '用户名或密码不合法';
      return;
    }

    const mode = $('#auth-submit').dataset.mode || 'login';

    const res = mode === 'login'
      ? await login(username, password)
      : await register(username, password);

    if (!res.success) {
      $('#auth-error').textContent = res.error;
      return;
    }

    updateUserBar(username);
    $('#auth-modal').classList.add('hidden');
    $('#app').classList.remove('hidden');
    startApp();
  };
}

/* ================= 控制台 ================= */
function appendConsole(text) {
  const output = $('#console-output');
  const div = document.createElement('div');
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

/* ================= 语言 ================= */
function setLanguage(lang) {
  state.currentLanguage = lang;

  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.textContent === lang)
  );

  updateEditorMode(lang);
  setCode(getPlaceholderText(lang));
}

/* ================= 练习 ================= */
function selectExercise(id) {
  const ex = exercises.find(e => e.id === id);
  if (!ex) return;

  state.currentExercise = ex;

  $('#title').textContent = ex.title;
  $('#desc').textContent = ex.desc;
  $('#sample-in').textContent = ex.sampleIn;
  $('#sample-out').textContent = ex.sampleOut;

  setCode(getPlaceholderText(state.currentLanguage));
}

/* ================= 编译 ================= */
async function runCheck() {
  appendConsole('检查中...');
  const res = await checkCode(getCode(), state.currentLanguage);

  if (res.success) {
    appendConsole('✅ 编译通过');
  } else {
    appendConsole('❌ 编译错误：');
    appendConsole(res.stderr || '');
  }
}

/* ================= 运行 ================= */
async function runProgram() {
  appendConsole('运行中...');

  const res = await compileCode(
    getCode(),
    state.currentExercise?.sampleIn || '',
    state.currentLanguage
  );

  if (!res.success) {
    appendConsole('❌ 错误：');
    appendConsole(res.stderr || '');
    return;
  }

  appendConsole('✅ 输出：');
  appendConsole(res.stdout || '');
}

/* ================= 保存 ================= */
async function saveCurrentCode() {
  const res = await saveSnippet(
    state.currentExercise?.title || '代码',
    state.currentLanguage,
    getCode()
  );

  if (res.success) {
    appendConsole(`✅ 已保存 ID=${res.id}`);
  }
}

/* ================= 加载列表 ================= */
async function refreshSavedList() {
  const res = await listSnippets();

  if (!res.success) return;

  const list = $('#saved-list');
  list.innerHTML = '';

  res.snippets.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.title}`;
    li.onclick = () => loadSavedSnippet(item.id);
    list.appendChild(li);
  });
}

async function loadSavedSnippet(id) {
  const res = await getSnippet(id);
  if (!res.success) return;

  setCode(res.snippet.code);
}

/* ================= 主程序 ================= */
function startApp() {

  /* 语言按钮 */
  const langBox = $('#language-buttons');
  languages.forEach(lang => {
    const btn = document.createElement('button');
    btn.className = 'lang-btn';
    btn.textContent = lang;
    btn.onclick = () => setLanguage(lang);
    langBox.appendChild(btn);
  });

  setLanguage(state.currentLanguage);

  /* 练习列表 */
  const list = $('#exercises');
  exercises.forEach(ex => {
    const li = document.createElement('li');
    li.textContent = ex.title;
    li.onclick = () => selectExercise(ex.id);
    list.appendChild(li);
  });

  /* 按钮 */
  $('#check').onclick = runCheck;
  $('#run-code').onclick = runProgram;
  $('#save').onclick = saveCurrentCode;
  $('#refresh-saved').onclick = refreshSavedList;

  $('#command-submit').onclick = runProgram;

  $('#command-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runProgram();
    }
  });

  initEditor(state.currentLanguage);
  initAI();
}

/* ================= 启动 ================= */
initAuth();
