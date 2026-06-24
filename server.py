#!/usr/bin/env python3
import http.server
import http.cookies
import hashlib
import hmac
import json
import os
import secrets
import socketserver
import sqlite3
import subprocess
import tempfile
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, unquote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PORT = int(os.environ.get("PORT", "7000"))
URL_PREFIX = os.environ.get("URL_PREFIX", "/c_learning")
STATIC_DIR = os.path.join(BASE_DIR, "web")
DB_PATH = os.path.join(BASE_DIR, "code_store.db")

DEEPSEEK_API_URL = os.environ.get(
    "DEEPSEEK_API_URL",
    "https://api.deepseek.com/chat/completions"
)
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")

SESSION_COOKIE_NAME = "c_learning_session"
SESSION_TTL_HOURS = int(os.environ.get("SESSION_TTL_HOURS", "24"))

COMPILE_TIMEOUT_SECONDS = int(os.environ.get("COMPILE_TIMEOUT_SECONDS", "5"))
RUN_TIMEOUT_SECONDS = int(os.environ.get("RUN_TIMEOUT_SECONDS", "3"))
MAX_CODE_LENGTH = int(os.environ.get("MAX_CODE_LENGTH", "50000"))


# ================= DB =================
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT
        )
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions(
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            expires_at TEXT
        )
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS ai_logs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            question TEXT,
            answer TEXT,
            created_at TEXT
        )
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS run_logs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            code TEXT,
            stdout TEXT,
            stderr TEXT,
            created_at TEXT
        )
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS snippets(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            language TEXT,
            code TEXT,
            created_at TEXT
        )
        """)
        conn.commit()


# ================= AUTH =================
def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100000
    )
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    salt, hashed = stored.split(":", 1)
    new = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        100000
    )
    return hmac.compare_digest(new.hex(), hashed)


def create_session(uid):
    sid = secrets.token_urlsafe(32)
    exp = (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO sessions(id, user_id, expires_at) VALUES(?,?,?)",
            (sid, uid, exp)
        )
        conn.commit()

    return sid


def delete_session(sid):
    if not sid:
        return
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
        conn.commit()


def get_user_by_session(sid):
    if not sid:
        return None

    now = datetime.utcnow().isoformat()

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute(
            """
            SELECT users.id, users.username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.id = ? AND expires_at > ?
            """,
            (sid, now)
        )
        row = cur.fetchone()

    return {"id": row[0], "username": row[1]} if row else None


# ================= Local C Runner =================
def local_compile_and_run(code, stdin_data=""):
    """
    警告：当前是宿主机直接编译执行，不是安全沙箱。
    仅适合个人学习环境，不建议直接暴露到公网。
    """
    if len(code) > MAX_CODE_LENGTH:
        return {
            "stdout": "",
            "stderr": "代码过长",
            "compile_error": True,
            "returncode": -1
        }

    blocked_tokens = [
        "system(", "fork(", "execl(", "execv(", "execvp(",
        "popen(", "remove(", "rename(", "unlink(", "kill(",
    ]
    lowered = code.lower()
    if any(token in lowered for token in blocked_tokens):
        return {
            "stdout": "",
            "stderr": "检测到危险函数，已拒绝执行",
            "compile_error": True,
            "returncode": -1
        }

    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "main.c")

        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)

        compile_result = subprocess.run(
            ["gcc", "main.c", "-O2", "-std=c11", "-o", "main"],
            cwd=tmp,
            text=True,
            capture_output=True,
            timeout=COMPILE_TIMEOUT_SECONDS
        )

        if compile_result.returncode != 0:
            return {
                "stdout": compile_result.stdout,
                "stderr": compile_result.stderr,
                "compile_error": True,
                "returncode": compile_result.returncode
            }

        run_result = subprocess.run(
            ["./main"],
            cwd=tmp,
            text=True,
            input=stdin_data,
            capture_output=True,
            timeout=RUN_TIMEOUT_SECONDS
        )

        return {
            "stdout": run_result.stdout,
            "stderr": run_result.stderr,
            "compile_error": False,
            "returncode": run_result.returncode
        }


# ================= Handler =================
class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        request_path = parsed.path

        if request_path == "/":
            request_path = URL_PREFIX + "/"

        if request_path.startswith(URL_PREFIX):
            request_path = request_path[len(URL_PREFIX):] or "/"

        request_path = unquote(request_path)
        request_path = request_path.lstrip("/")
        local_path = os.path.normpath(os.path.join(STATIC_DIR, request_path))

        if not local_path.startswith(os.path.abspath(STATIC_DIR)):
            return STATIC_DIR

        if os.path.isdir(local_path):
            return os.path.join(local_path, "index.html")
        return local_path

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def get_user(self):
        cookie_header = self.headers.get("Cookie", "")
        cookies = http.cookies.SimpleCookie()
        cookies.load(cookie_header)

        morsel = cookies.get(SESSION_COOKIE_NAME)
        if not morsel:
            return None
        return get_user_by_session(morsel.value)

    def get_session_id(self):
        cookie_header = self.headers.get("Cookie", "")
        cookies = http.cookies.SimpleCookie()
        cookies.load(cookie_header)
        morsel = cookies.get(SESSION_COOKIE_NAME)
        return morsel.value if morsel else None

    def send_json(self, data, status=200, cookies=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if cookies:
            for cookie in cookies:
                self.send_header("Set-Cookie", cookie.OutputString())
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def make_session_cookie(self, sid, expires=False):
        cookie = http.cookies.SimpleCookie()
        cookie[SESSION_COOKIE_NAME] = sid if not expires else ""
        cookie[SESSION_COOKIE_NAME]["path"] = URL_PREFIX or "/"
        cookie[SESSION_COOKIE_NAME]["httponly"] = True
        cookie[SESSION_COOKIE_NAME]["samesite"] = "Lax"
        if expires:
            cookie[SESSION_COOKIE_NAME]["max-age"] = 0
        return cookie[SESSION_COOKIE_NAME]

    # ========= Auth =========
    def handle_register(self):
        data = self.read_json_body()
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        if not username or len(password) < 6:
            return self.send_json({"success": False, "error": "用户名不能为空，且密码至少 6 位"}, 400)

        try:
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute(
                    "INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)",
                    (username, hash_password(password), datetime.utcnow().isoformat())
                )
                conn.commit()
        except sqlite3.IntegrityError:
            return self.send_json({"success": False, "error": "用户名已存在"}, 400)

        return self.send_json({"success": True})

    def handle_login(self):
        data = self.read_json_body()
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.execute(
                "SELECT id, password_hash FROM users WHERE username = ?",
                (username,)
            )
            row = cur.fetchone()

        if not row or not verify_password(password, row[1]):
            return self.send_json({"success": False, "error": "用户名或密码错误"}, 401)

        sid = create_session(row[0])
        cookie = self.make_session_cookie(sid)
        return self.send_json({"success": True, "username": username}, cookies=[cookie])

    def handle_logout(self):
        sid = self.get_session_id()
        delete_session(sid)
        cookie = self.make_session_cookie("", expires=True)
        return self.send_json({"success": True}, cookies=[cookie])

    def handle_me(self):
        user = self.get_user()
        if user:
            return self.send_json({
                "success": True,
                "authenticated": True,
                "username": user["username"]
            })
        return self.send_json({
            "success": True,
            "authenticated": False
        })

    # ========= AI =========
    def handle_ai(self):
        user = self.get_user()
        if not user:
            return self.send_json({"success": False, "error": "未登录"}, 401)

        data = self.read_json_body()
        question = (data.get("question") or "").strip()

        if not question:
            return self.send_json({"success": False, "error": "问题不能为空"}, 400)

        api_key = os.environ.get("DEEPSEEK_API_KEY")
        if not api_key:
            return self.send_json({"success": False, "error": "未配置 DEEPSEEK_API_KEY"}, 500)

        req = urllib.request.Request(
            DEEPSEEK_API_URL,
            data=json.dumps({
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "user", "content": question}
                ]
            }).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode("utf-8"))
            ans = res["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="ignore")
            return self.send_json({
                "success": False,
                "error": "DeepSeek API HTTP Error",
                "detail": err
            }, 500)
        except Exception as e:
            return self.send_json({
                "success": False,
                "error": "DeepSeek API 调用失败",
                "detail": str(e)
            }, 500)

        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO ai_logs(user_id, question, answer, created_at)
                VALUES(?,?,?,?)
                """,
                (user["id"], question, ans, datetime.utcnow().isoformat())
            )
            conn.commit()

        return self.send_json({"success": True, "answer": ans})

    # ========= Compile =========
    def handle_compile(self):
        data = self.read_json_body()
        code = data.get("code", "")
        stdin_data = data.get("stdin", "")

        if not code.strip():
            return self.send_json({"success": False, "error": "代码不能为空"}, 400)

        try:
            result = local_compile_and_run(code, stdin_data)
        except subprocess.TimeoutExpired:
            return self.send_json({
                "success": False,
                "stderr": "程序执行超时"
            }, 408)
        except FileNotFoundError:
            return self.send_json({
                "success": False,
                "stderr": "未找到 gcc，请先安装 gcc"
            }, 500)
        except Exception as e:
            return self.send_json({
                "success": False,
                "stderr": str(e)
            }, 500)

        user = self.get_user()
        user_id = user["id"] if user else None

        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO run_logs(user_id, code, stdout, stderr, created_at)
                VALUES(?,?,?,?,?)
                """,
                (
                    user_id,
                    code,
                    result.get("stdout", ""),
                    result.get("stderr", ""),
                    datetime.utcnow().isoformat()
                )
            )
            conn.commit()

        return self.send_json({"success": True, **result})

    def handle_check(self):
        data = self.read_json_body()
        code = data.get("code", "")

        if not code.strip():
            return self.send_json({"success": False, "stderr": "代码不能为空"}, 400)

        try:
            result = local_compile_and_run(code, "")
        except subprocess.TimeoutExpired:
            return self.send_json({"success": False, "stderr": "编译超时"}, 408)
        except FileNotFoundError:
            return self.send_json({"success": False, "stderr": "未找到 gcc，请先安装 gcc"}, 500)
        except Exception as e:
            return self.send_json({"success": False, "stderr": str(e)}, 500)

        if result["compile_error"]:
            return self.send_json({"success": False, **result})
        return self.send_json({"success": True, **result})

    # ========= Snippets =========
    def handle_save(self):
        user = self.get_user()
        if not user:
            return self.send_json({"success": False, "error": "未登录"}, 401)

        data = self.read_json_body()
        title = (data.get("title") or "代码").strip() or "代码"
        language = (data.get("language") or "C").strip() or "C"
        code = data.get("code") or ""

        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.execute(
                """
                INSERT INTO snippets(user_id, title, language, code, created_at)
                VALUES(?,?,?,?,?)
                """,
                (user["id"], title, language, code, datetime.utcnow().isoformat())
            )
            conn.commit()
            snippet_id = cur.lastrowid

        return self.send_json({"success": True, "id": snippet_id})

    def handle_list(self):
        user = self.get_user()
        if not user:
            return self.send_json({"success": False, "error": "未登录"}, 401)

        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.execute(
                "SELECT id, title, language, created_at FROM snippets WHERE user_id = ? ORDER BY id DESC",
                (user["id"],)
            )
            rows = cur.fetchall()

        snippets = [
            {
                "id": row[0],
                "title": row[1],
                "language": row[2],
                "created_at": row[3]
            }
            for row in rows
        ]
        return self.send_json({"success": True, "snippets": snippets})

    def handle_snippet(self):
        user = self.get_user()
        if not user:
            return self.send_json({"success": False, "error": "未登录"}, 401)

        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        snippet_id = (qs.get("id") or [""])[0]
        if not snippet_id.isdigit():
            return self.send_json({"success": False, "error": "无效的 snippet id"}, 400)

        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.execute(
                "SELECT id, title, language, code, created_at FROM snippets WHERE id = ? AND user_id = ?",
                (int(snippet_id), user["id"])
            )
            row = cur.fetchone()

        if not row:
            return self.send_json({"success": False, "error": "未找到代码"}, 404)

        return self.send_json({
            "success": True,
            "snippet": {
                "id": row[0],
                "title": row[1],
                "language": row[2],
                "code": row[3],
                "created_at": row[4]
            }
        })

    # ========= Routes =========
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.endswith("/api/me"):
            return self.handle_me()
        if path.endswith("/api/list"):
            return self.handle_list()
        if path.endswith("/api/snippet"):
            return self.handle_snippet()

        # 静态文件
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path.endswith("/api/register"):
            return self.handle_register()
        if path.endswith("/api/login"):
            return self.handle_login()
        if path.endswith("/api/logout"):
            return self.handle_logout()
        if path.endswith("/api/ai"):
            return self.handle_ai()
        if path.endswith("/api/compile"):
            return self.handle_compile()
        if path.endswith("/api/check"):
            return self.handle_check()
        if path.endswith("/api/save"):
            return self.handle_save()

        return self.send_json({"success": False, "error": "Not Found"}, 404)


# ================= Server =================
class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    init_db()
    print(f"running on port {PORT}...")
    with Server(("", PORT), Handler) as s:
        s.serve_forever()
