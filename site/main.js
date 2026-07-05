const API_BASE = '/c_learning/api/';

function $(sel){return document.querySelector(sel)}

async function apiFetch(path, opts={}){
  const res = await fetch(API_BASE + path, {
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    ...opts
  });
  const ct = res.headers.get('Content-Type')||'';
  if (ct.indexOf('application/json')!==-1) return res.json();
  const txt = await res.text();
  return {success: res.ok, error: txt};
}

async function renderList(){
  const ul = $('#course-list'); ul.innerHTML='';
  const data = await apiFetch('courses');
  if(!data || !data.success) { ul.innerHTML = '<li>加载失败</li>'; return; }
  data.items.forEach(item=>{
    const li = document.createElement('li'); li.textContent = item.title || '未命名课程';
    li.onclick = ()=>openCourse(item.id);
    ul.appendChild(li);
  });
}

async function openCourse(id){
  const data = await apiFetch('course?id='+encodeURIComponent(id));
  if(!data || !data.success) { alert('加载课程失败: '+(data && data.error)); return; }
  const c = data.item;
  $('#workspace').classList.remove('hidden');
  $('#course-title').textContent = c.title;
  $('#course-text').value = c.text || '';
  $('#code-editor').value = c.code || '';
  $('#code-lang').value = c.language || 'javascript';
  // clear existing student blocks and recreate from saved data
  const list = $('#student-code-list'); list.innerHTML = '';
  const blocks = c.student_blocks || [];
  blocks.forEach(b=>createStudentBlock(b.code||'', b.language||'javascript'));
  // set code font size if provided
  if(c.code_font_size) $('#code-font-size').value = c.code_font_size;
  $('#code-font-size').dispatchEvent(new Event('input'));
  $('#save-text').onclick = async ()=>{
    // collect student blocks
    const student_blocks = Array.from(document.querySelectorAll('.student-block')).map(sb=>({ code: sb.querySelector('textarea').value, language: sb.querySelector('.student-lang').value }));
    const body = { id: String(c.id), title: $('#course-title').textContent, text: $('#course-text').value, code: $('#code-editor').value, language: $('#code-lang').value, student_blocks, code_font_size: $('#code-font-size').value };
    const r = await apiFetch('course/save', {method:'POST', body: JSON.stringify(body)});
    if(r && r.success) { alert('已保存'); renderList(); } else { alert('保存失败:'+ (r && r.error)); }
  };
}

function newCourseFlow(){ $('#modal').classList.remove('hidden'); }

async function createCourse(){
  const title = $('#new-title').value.trim()||'新课程';
  const text = $('#new-text').value||'';
  const body = { title, text, code: '// 示例', language: 'javascript' };
  const r = await apiFetch('course/save', { method: 'POST', body: JSON.stringify(body)});
  if(r && r.success) { $('#modal').classList.add('hidden'); renderList(); } else { alert('创建失败:'+ (r && r.error)); }
}

function runCode(){
  const lang = $('#code-lang').value;
  const code = $('#code-editor').value;
  const out = $('#cmd-output');
  if(lang==='javascript'){
    try{
      const logs = [];
      const consoleShim = {log: (...args)=>logs.push(args.join(' ')), error: (...args)=>logs.push('ERR: '+args.join(' ')) };
      const fn = new Function('console', code);
      fn(consoleShim);
      out.textContent += logs.join('\n') + '\n';
    }catch(e){ out.textContent += 'Error: '+e.message + '\n'; }
  } else {
    out.textContent += '运行仅支持 JavaScript，其他语言请导出并在本地编译运行。\n';
  }
  out.scrollTop = out.scrollHeight;
}

function createStudentBlock(code='', language='javascript'){
  const container = document.createElement('div'); container.className='student-block';
  container.innerHTML = `
    <div class="student-meta"><strong>学生编程区</strong>
      <select class="student-lang">
        <option value="javascript">JavaScript</option>
        <option value="text">Plain Text</option>
      </select>
      <button class="remove-student">删除</button>
    </div>
    <textarea class="student-code" spellcheck="false"></textarea>
    <div class="student-actions">
      <button class="run-student">运行</button>
      <button class="clear-student">清空输出</button>
    </div>
    <pre class="student-output cmd-output" aria-live="polite"></pre>
  `;
  const list = $('#student-code-list'); list.appendChild(container);
  const ta = container.querySelector('textarea'); ta.value = code;
  container.querySelector('.student-lang').value = language;
  container.querySelector('.remove-student').onclick = ()=>container.remove();
  container.querySelector('.run-student').onclick = ()=>{
    const lang = container.querySelector('.student-lang').value;
    const code = ta.value;
    const out = container.querySelector('.student-output');
    if(lang==='javascript'){
      try{
        const logs = []; const consoleShim = {log:(...a)=>logs.push(a.join(' ')), error:(...a)=>logs.push('ERR: '+a.join(' '))};
        const fn = new Function('console', code);
        fn(consoleShim);
        out.textContent += logs.join('\n') + '\n';
      }catch(e){ out.textContent += 'Error: '+e.message + '\n'; }
    } else {
      out.textContent += '仅支持 JavaScript 运行。\n';
    }
    out.scrollTop = out.scrollHeight;
  };
  container.querySelector('.clear-student').onclick = ()=>{ container.querySelector('.student-output').textContent=''; };
  // apply current code font size
  const codeFs = $('#code-font-size') && $('#code-font-size').value;
  if(codeFs) ta.style.fontSize = codeFs + 'px';
  return container;
}

function insertCodeSnippet(){
  const ta = $('#course-text');
  const selStart = ta.selectionStart, selEnd = ta.selectionEnd;
  const selected = ta.value.slice(selStart, selEnd) || '示例代码';
  const insert = '\n```\n' + selected + '\n```\n';
  ta.setRangeText(insert, selStart, selEnd, 'end');
  ta.focus();
}

function init(){
  renderList();
  $('#new-course-btn').onclick = newCourseFlow;
  $('#create-course').onclick = createCourse;
  $('#cancel-create').onclick = ()=>$('#modal').classList.add('hidden');
  $('#run-code').onclick = runCode;
  $('#clear-cmd').onclick = ()=>{ $('#cmd-output').textContent=''; };
  $('#font-size').oninput = (e)=>{ $('#course-text').style.fontSize = e.target.value + 'px' };
  const toggleBtn = $('#toggle-max');
  if(toggleBtn){
    toggleBtn.onclick = ()=>{
      const is = document.body.classList.toggle('fullscreen-editor');
      toggleBtn.textContent = is ? '恢复' : '最大化';
      if(is) $('#workspace').classList.remove('hidden');
      // allow layout to settle
      setTimeout(()=>{ window.dispatchEvent(new Event('resize')); }, 100);
    };
  }
  // insert code snippet button
  const ins = $('#insert-code-snippet'); if(ins) ins.onclick = insertCodeSnippet;
  // code font size control
  const codeSize = $('#code-font-size'); if(codeSize){
    codeSize.oninput = (e)=>{ const s = e.target.value + 'px'; $('#code-editor').style.fontSize = s; document.querySelectorAll('.student-code').forEach(t=>t.style.fontSize = s); };
  }
  // add student block
  const addBtn = $('#add-student-code'); if(addBtn) addBtn.onclick = ()=>createStudentBlock();
}

document.addEventListener('DOMContentLoaded', init);
