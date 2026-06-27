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
from datetime import datetime, timedelta
from urllib.parse import urlparse, parse_qs, unquote

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PORT = 7000
URL_PREFIX = "/c_learning"
STATIC_DIR = os.path.join(BASE_DIR, "web")
DB_PATH = os.path.join(BASE_DIR, "code_store.db")

SESSION_COOKIE_NAME = "c_learning_session"
SESSION_TTL_HOURS = 24

DEEPSEEK_API_KEY = "你的API_KEY"  # ✅ 换成你自己的key


def call_deepseek(question):
    url = "https://api.deepseek.com/v1/chat/completions"

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一个C语言教学助手"},
            {"role": "user", "content": question}
        ],
        "temperature": 0.7
    }

    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {DEEPSEEK_API_KEY}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            return res_data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"AI请求失败：{str(e)}"



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
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    salt, h = stored.split(":")
    new = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100000)
    return hmac.compare_digest(new.hex(), h)


def create_session(uid):
    sid = secrets.token_urlsafe(32)
    exp = (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT INTO sessions(id, user_id, expires_at) VALUES(?,?,?)", (sid, uid, exp))
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
        cur = conn.execute("""
            SELECT users.id, users.username
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.id = ? AND sessions.expires_at > ?
        """, (sid, now))
        row = cur.fetchone()

    return {"id": row[0], "username": row[1]} if row else None


# ================= 编译 / 运行 =================
def run_command(cmd, cwd, stdin_text=""):
    return subprocess.run(
        cmd,
        cwd=cwd,
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=5
    )


def compile_only(code, language):
    with tempfile.TemporaryDirectory() as tmp:
        if language == "C":
            src = os.path.join(tmp, "main.c")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["gcc", "main.c", "-o", "main"], tmp)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "C++":
            src = os.path.join(tmp, "main.cpp")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["g++", "main.cpp", "-o", "main"], tmp)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "Python":
            src = os.path.join(tmp, "main.py")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["python3", "-m", "py_compile", "main.py"], tmp)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "JavaScript":
            src = os.path.join(tmp, "main.js")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["node", "--check", "main.js"], tmp)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        return {"success": False, "stderr": f"不支持的语言: {language}"}


def compile_and_run(code, stdin_text, language):
    with tempfile.TemporaryDirectory() as tmp:
        if language == "C":
            src = os.path.join(tmp, "main.c")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["gcc", "main.c", "-o", "main"], tmp)
            if r.returncode != 0:
                return {"success": False, "stdout": "", "stderr": r.stderr}
            r = run_command(["./main"], tmp, stdin_text)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "C++":
            src = os.path.join(tmp, "main.cpp")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["g++", "main.cpp", "-o", "main"], tmp)
            if r.returncode != 0:
                return {"success": False, "stdout": "", "stderr": r.stderr}
            r = run_command(["./main"], tmp, stdin_text)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "Python":
            src = os.path.join(tmp, "main.py")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["python3", "main.py"], tmp, stdin_text)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        elif language == "JavaScript":
            src = os.path.join(tmp, "main.js")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            r = run_command(["node", "main.js"], tmp, stdin_text)
            return {"success": r.returncode == 0, "stdout": r.stdout, "stderr": r.stderr}

        return {"success": False, "stdout": "", "stderr": f"不支持的语言: {language}"}


# ================= Handler =================
class Handler(http.server.SimpleHTTPRequestHandler):

    def translate_path(self, path):
        parsed = urlparse(path)
        path = parsed.path

        if path == "/":
            path = URL_PREFIX + "/"

        if path.startswith(URL_PREFIX):
            path = path[len(URL_PREFIX):] or "/"

        path = unquote(path).lstrip("/")
        if not path:
            path = "index.html"
        return os.path.join(STATIC_DIR, path)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def get_session_id(self):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        sid = cookies.get(SESSION_COOKIE_NAME)
        return sid.value if sid else None

    def get_user(self):
        return get_user_by_session(self.get_session_id())

    # ===== GET =====
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path.endswith("/api/me"):
            user = self.get_user()
            return self.send_json({
                "success": True,
                "authenticated": bool(user),
                "username": user["username"] if user else None
            })

        if parsed.path.endswith("/api/list"):
            user = self.get_user()
            if not user:
                return self.send_json({"success": False, "error": "未登录"}, 401)

            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.execute("""
                    SELECT id, title, language, created_at
                    FROM snippets
                    WHERE user_id = ?
                    ORDER BY id DESC
                """, (user["id"],))
                rows = cur.fetchall()

            return self.send_json({
                "success": True,
                "items": [
                    {"id": r[0], "title": r[1], "language": r[2], "created_at": r[3]}
                    for r in rows
                ]
            })

        if parsed.path.endswith("/api/snippet"):
            user = self.get_user()
            if not user:
                return self.send_json({"success": False, "error": "未登录"}, 401)

            qs = parse_qs(parsed.query)
            sid = qs.get("id", [None])[0]
            if not sid:
                return self.send_json({"success": False, "error": "缺少 id"}, 400)

            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.execute("""
                    SELECT id, title, language, code, created_at
                    FROM snippets
                    WHERE id = ? AND user_id = ?
                """, (sid, user["id"]))
                row = cur.fetchone()

            if not row:
                return self.send_json({"success": False, "error": "未找到代码片段"}, 404)

            return self.send_json({
                "success": True,
                "item": {
                    "id": row[0],
                    "title": row[1],
                    "language": row[2],
                    "code": row[3],
                    "created_at": row[4]
                }
            })

        return super().do_GET()

    # ===== POST =====
    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path.endswith("/api/register"):
            try:
                data = self.read_json()
                username = (data.get("username") or "").strip()
                password = data.get("password") or ""

                if not username:
                    return self.send_json({"success": False, "error": "用户名不能为空"}, 400)
                if len(password) < 6:
                    return self.send_json({"success": False, "error": "密码至少 6 位"}, 400)

                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute(
                        "INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)",
                        (username, hash_password(password), datetime.utcnow().isoformat())
                    )
                    conn.commit()

                return self.send_json({"success": True})
            except sqlite3.IntegrityError:
                return self.send_json({"success": False, "error": "用户名已存在"}, 400)

        if parsed.path.endswith("/api/login"):
            data = self.read_json()
            username = (data.get("username") or "").strip()
            password = data.get("password") or ""

            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,))
                row = cur.fetchone()

            if not row or not verify_password(password, row[1]):
                return self.send_json({"success": False, "error": "登录失败"}, 401)

            sid = create_session(row[0])

            cookie = http.cookies.SimpleCookie()
            cookie[SESSION_COOKIE_NAME] = sid
            cookie[SESSION_COOKIE_NAME]["path"] = "/"
            cookie[SESSION_COOKIE_NAME]["httponly"] = True

            body = json.dumps({"success": True}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Set-Cookie", cookie.output(header='').strip())
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path.endswith("/api/logout"):
            sid = self.get_session_id()
            delete_session(sid)

            cookie = http.cookies.SimpleCookie()
            cookie[SESSION_COOKIE_NAME] = ""
            cookie[SESSION_COOKIE_NAME]["path"] = "/"
            cookie[SESSION_COOKIE_NAME]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"

            body = json.dumps({"success": True}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Set-Cookie", cookie.output(header='').strip())
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path.endswith("/api/check"):
            data = self.read_json()
            code = data.get("code", "")
            language = data.get("language", "C")
            result = compile_only(code, language)
            return self.send_json(result)

        if parsed.path.endswith("/api/compile"):
            data = self.read_json()
            code = data.get("code", "")
            stdin_text = data.get("stdin", "")
            language = data.get("language", "C")
            result = compile_and_run(code, stdin_text, language)
            return self.send_json(result)

        if parsed.path.endswith("/api/ai"):
            data = self.read_json()
            question = (data.get("question") or "").strip()

            # 这里先做本地占位版，避免前端报错
            # 以后你接 OpenAI / 通义 / Kimi / DeepSeek 时，在这里替换
            answer = f"你问的是：{question}\n\n目前后端 AI 接口已打通，但还没有接入真实大模型。"

            return self.send_json({
                "success": True,
                "answer": answer
            })

        if parsed.path.endswith("/api/save"):
            user = self.get_user()
            if not user:
                return self.send_json({"success": False, "error": "未登录"}, 401)

            data = self.read_json()
            title = (data.get("title") or "").strip()
            language = data.get("language", "C")
            code = data.get("code", "")

            if not title:
                return self.send_json({"success": False, "error": "标题不能为空"}, 400)

            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.execute("""
                    INSERT INTO snippets(user_id, title, language, code, created_at)
                    VALUES(?,?,?,?,?)
                """, (user["id"], title, language, code, datetime.utcnow().isoformat()))
                conn.commit()
                snippet_id = cur.lastrowid

            return self.send_json({"success": True, "id": snippet_id})

        return self.send_json({"success": False, "error": "not found"}, 404)


# ================= Server =================
class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    init_db()
    print(f"running on {PORT}")
    with Server(("", PORT), Handler) as s:
        s.serve_forever()