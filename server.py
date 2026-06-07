#!/usr/bin/env python3
import http.server
import json
import os
import socketserver
import sqlite3
import signal
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import urllib.error
import resource
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)

def load_env_file():
    env_path = os.path.join(BASE_DIR, '.env')
    if not os.path.exists(env_path):
        return

    with open(env_path, 'r', encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


load_env_file()

PORT = int(os.environ.get('PORT', '7000'))
URL_PREFIX = '/c_learning'
STATIC_DIR = os.path.join(BASE_DIR, 'web')
DB_PATH = os.path.join(BASE_DIR, 'code_store.db')
DEEPSEEK_API_URL = os.environ.get('DEEPSEEK_API_URL', 'https://api.deepseek.com/chat/completions')
DEEPSEEK_MODEL = os.environ.get('DEEPSEEK_MODEL', 'deepseek-chat')

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS snippets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                language TEXT NOT NULL,
                code TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()


def save_snippet(title, language, code):
    created_at = datetime.utcnow().isoformat() + 'Z'
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            'INSERT INTO snippets (title, language, code, created_at) VALUES (?, ?, ?, ?)',
            (title, language, code, created_at)
        )
        conn.commit()
        return cursor.lastrowid


def list_snippets():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            'SELECT id, title, language, created_at FROM snippets ORDER BY id DESC LIMIT 50'
        )
        return [
            {'id': row[0], 'title': row[1], 'language': row[2], 'created_at': row[3]}
            for row in cursor.fetchall()
        ]


def get_snippet(snippet_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            'SELECT id, title, language, code, created_at FROM snippets WHERE id = ?',
            (snippet_id,)
        )
        row = cursor.fetchone()
    if not row:
        return None
    return {
        'id': row[0],
        'title': row[1],
        'language': row[2],
        'code': row[3],
        'created_at': row[4],
    }


def limit_resources():
    # 限制执行环境资源；此方式仅适用于 Linux/Unix 环境
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (3, 5))
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NPROC, (4, 8))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    except Exception:
        pass


def prepare_sandbox():
    # 创建新的会话 / 进程组，方便后续超时时彻底终止所有子进程。
    try:
        os.setsid()
    except Exception:
        pass
    limit_resources()


def build_ai_messages(question, language='', mode='', code=''):
    system_prompt = (
        '你是一个面向编程练习平台的中文 AI 助手。'
        '回答要直接、准确、简洁，优先帮助用户理解代码、修复错误、给出下一步建议。'
    )
    context_parts = []
    if language:
        context_parts.append(f'当前语言：{language}')
    if mode:
        context_parts.append(f'当前模式：{mode}')
    if code:
        context_parts.append('当前编辑器代码如下：\n' + code)

    user_prompt = question
    if context_parts:
        user_prompt += '\n\n上下文信息：\n' + '\n'.join(context_parts)

    return [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def query_deepseek(question, language='', mode='', code=''):
    api_key = (
        os.environ.get('DEEPSEEK_API_KEY')
        or os.environ.get('DEEPSEEK_KEY')
        or os.environ.get('DEEPSEEKKEY')
        or os.environ.get('OPENAI_API_KEY')
    )
    if not api_key:
        return False, '未配置 DeepSeek API key。请在服务端环境变量或 .env 中设置 DEEPSEEK_API_KEY、DEEPSEEK_KEY 或 DEEPSEEKKEY 后重启服务。'

    payload = {
        'model': os.environ.get('DEEPSEEK_MODEL', DEEPSEEK_MODEL),
        'messages': build_ai_messages(question, language, mode, code),
        'temperature': 0.3,
    }
    body = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response_data = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as ex:
        error_body = ex.read().decode('utf-8', errors='ignore')
        return False, f'DeepSeek 请求失败（HTTP {ex.code}）：{error_body or ex.reason}'
    except urllib.error.URLError as ex:
        return False, f'无法连接 DeepSeek 服务：{ex.reason}'
    except TimeoutError:
        return False, 'DeepSeek 请求超时，请稍后重试。'
    except json.JSONDecodeError:
        return False, 'DeepSeek 返回了无法解析的响应。'

    choices = response_data.get('choices') or []
    if not choices:
        return False, 'DeepSeek 未返回可用回答。'

    message = choices[0].get('message') or {}
    content = message.get('content', '').strip()
    if not content:
        return False, 'DeepSeek 返回内容为空。'

    return True, content

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def strip_prefix(self, path):
        if path == URL_PREFIX:
            return '/'
        if path.startswith(URL_PREFIX + '/'):
            return path[len(URL_PREFIX):]
        return path

    def rewrite_static_path(self):
        parsed = urllib.parse.urlparse(self.path)
        stripped_path = self.strip_prefix(parsed.path)

        if parsed.path == URL_PREFIX:
            return None, URL_PREFIX + '/'

        self.path = stripped_path + ('?' + parsed.query if parsed.query else '')
        return stripped_path, None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        stripped_path, redirect_to = self.rewrite_static_path()

        if redirect_to is not None:
            self.send_response(301)
            self.send_header('Location', redirect_to)
            self.end_headers()
            return

        if stripped_path == '/api/list':
            self.handle_list()
        elif stripped_path == '/api/snippet':
            self.handle_get_snippet(parsed.query)
        else:
            super().do_GET()

    def do_HEAD(self):
        _, redirect_to = self.rewrite_static_path()

        if redirect_to is not None:
            self.send_response(301)
            self.send_header('Location', redirect_to)
            self.end_headers()
            return

        super().do_HEAD()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        stripped_path = self.strip_prefix(parsed.path)

        if stripped_path == '/api/compile':
            self.handle_compile(run_program=True)
        elif stripped_path == '/api/check':
            self.handle_compile(run_program=False)
        elif stripped_path == '/api/save':
            self.handle_save()
        elif stripped_path == '/api/ai':
            self.handle_ai()
        else:
            self.send_error(404, 'Not Found')

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        try:
            return json.loads(body), None
        except json.JSONDecodeError:
            return None, '请求体不是有效的 JSON。'

    def handle_save(self):
        data, error = self.read_json_body()
        if error:
            self.send_json({
                'success': False,
                'error': error
            })
            return

        title = data.get('title', '未命名代码')
        language = data.get('language', 'C')
        code = data.get('code', '')

        if not isinstance(code, str) or not code.strip():
            self.send_json({'success': False, 'error': 'code 不能为空。'})
            return

        snippet_id = save_snippet(title, language, code)
        self.send_json({'success': True, 'id': snippet_id})

    def handle_list(self):
        snippets = list_snippets()
        self.send_json({'success': True, 'snippets': snippets})

    def handle_get_snippet(self, query):
        params = urllib.parse.parse_qs(query)
        ids = params.get('id', [])
        if not ids:
            self.send_json({'success': False, 'error': '缺少 id 参数。'});
            return
        snippet = get_snippet(ids[0])
        if not snippet:
            self.send_json({'success': False, 'error': '未找到指定代码片段。'})
            return
        self.send_json({'success': True, 'snippet': snippet})

    def handle_compile(self, run_program=False):
        data, error = self.read_json_body()
        if error:
            self.send_json({
                'success': False,
                'error': error
            })
            return

        code = data.get('code', '')
        stdin = data.get('stdin', '')
        language = data.get('language', 'C')

        if not isinstance(code, str):
            self.send_json({'success': False, 'error': 'code 必须是字符串。'})
            return

        with tempfile.TemporaryDirectory() as tempdir:
            extension_map = {
                'C': 'c',
                'C++': 'cpp',
                'Java': 'java',
                'Python': 'py',
                'JavaScript': 'js',
                'Go': 'go',
                'Rust': 'rs'
            }
            ext = extension_map.get(language, 'c')
            source_filename = 'Main.' + ext
            source_path = os.path.join(tempdir, source_filename)
            exe_path = os.path.join(tempdir, 'main')
            with open(source_path, 'w', encoding='utf-8') as f:
                f.write(code)

            def compile_command(lang):
                if lang == 'C':
                    return ['gcc', '-Wall', '-Wextra', '-std=c11', source_path, '-o', exe_path]
                if lang == 'C++':
                    return ['g++', '-Wall', '-Wextra', '-std=c++17', source_path, '-o', exe_path]
                if lang == 'Java':
                    return ['javac', source_path]
                if lang == 'Python':
                    return [sys.executable, '-m', 'py_compile', source_path]
                if lang == 'JavaScript':
                    return ['node', '--check', source_path]
                if lang == 'Go':
                    return ['go', 'build', '-o', exe_path, source_path]
                if lang == 'Rust':
                    return ['rustc', source_path, '-o', exe_path]
                return ['gcc', '-Wall', '-Wextra', '-std=c11', source_path, '-o', exe_path]

            def run_command(lang):
                if lang in ('C', 'C++', 'Go', 'Rust'):
                    return [exe_path]
                if lang == 'Java':
                    return ['java', '-cp', tempdir, 'Main']
                if lang == 'Python':
                    return [sys.executable, source_path]
                if lang == 'JavaScript':
                    return ['node', source_path]
                return [exe_path]

            try:
                compile_cmd = compile_command(language)
                compile_proc = subprocess.run(
                    compile_cmd,
                    capture_output=True,
                    text=True,
                    timeout=12,
                    preexec_fn=prepare_sandbox,
                )
            except FileNotFoundError as ex:
                self.send_json({
                    'success': False,
                    'compiled': False,
                    'stderr': f'编译器未找到：{ex.filename}。请先安装对应工具。',
                    'stdout': ''
                })
                return
            except subprocess.TimeoutExpired:
                self.send_json({
                    'success': False,
                    'compiled': False,
                    'stderr': '编译过程超时，可能存在异常或编译器问题。',
                    'stdout': ''
                })
                return

            if compile_proc.returncode != 0:
                self.send_json({
                    'success': False,
                    'compiled': False,
                    'stderr': compile_proc.stderr.strip() or compile_proc.stdout.strip(),
                    'stdout': compile_proc.stdout.strip(),
                })
                return

            if not run_program:
                self.send_json({
                    'success': True,
                    'compiled': True,
                    'stderr': compile_proc.stderr.strip(),
                    'stdout': compile_proc.stdout.strip(),
                })
                return

            try:
                run_proc = subprocess.Popen(
                    run_command(language),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    cwd=tempdir if language == 'Java' else tempdir,
                    preexec_fn=prepare_sandbox,
                )
                stdout, stderr = run_proc.communicate(input=stdin, timeout=6)
                self.send_json({
                    'success': True,
                    'compiled': True,
                    'returncode': run_proc.returncode,
                    'stdout': stdout,
                    'stderr': stderr,
                })
            except subprocess.TimeoutExpired as ex:
                try:
                    os.killpg(os.getpgid(run_proc.pid), signal.SIGKILL)
                except Exception:
                    pass
                self.send_json({
                    'success': False,
                    'compiled': True,
                    'stderr': '程序运行超时。已终止任务。请检查是否进入死循环。',
                    'stdout': ex.stdout or '',
                })
            except FileNotFoundError as ex:
                self.send_json({
                    'success': False,
                    'compiled': False,
                    'stderr': f'运行时工具未找到：{ex.filename}。请安装对应语言运行环境。',
                    'stdout': ''
                })
                return

    def handle_ai(self):
        data, error = self.read_json_body()
        if error:
            self.send_json({'success': False, 'error': error})
            return

        question = data.get('question', '')
        language = data.get('language', '')
        mode = data.get('mode', '')
        code = data.get('code', '')

        if not isinstance(question, str) or not question.strip():
            self.send_json({'success': False, 'error': 'question 不能为空。'})
            return

        ok, result = query_deepseek(
            question=question.strip(),
            language=language if isinstance(language, str) else '',
            mode=mode if isinstance(mode, str) else '',
            code=code if isinstance(code, str) else '',
        )
        if not ok:
            self.send_json({'success': False, 'error': result})
            return

        self.send_json({'success': True, 'answer': result})

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    init_db()
    print(f'启动本地服务，访问 http://localhost:{PORT}{URL_PREFIX}/ 运行代码。')
    with socketserver.TCPServer(('', PORT), RequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止服务。')
