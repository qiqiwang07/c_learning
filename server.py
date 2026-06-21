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

BASE_DIR = os.path.dirname(__file__)

PORT = int(os.environ.get("PORT", "7000"))
URL_PREFIX = "/c_learning"
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


# ================= AUTH =================
def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        100000
    )
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    salt, h = stored.split(":")
    new = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        bytes.fromhex(salt),
        100000
    )
    return hmac.compare_digest(new.hex(), h)


def create_session(uid):
    sid = secrets.token_urlsafe(32)
    exp = (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT INTO sessions VALUES(?,?,?)",
            (sid, uid, exp)
        )

    return sid


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
def local_compile_and_run(code):
    """
    不使用 Docker：
    1. 创建临时目录
    2. 写入 main.c
    3. 使用宿主机 gcc 编译
    4. 执行 ./main

    注意：
    这不是安全沙箱。
    如果用户提交恶意 C 代码，可能影响宿主机。
    """

    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "main.c")
        binary_path = os.path.join(tmp, "main")

        with open(source_path, "w", encoding="utf-8") as f:
            f.write(code)

        compile_result = subprocess.run(
            ["gcc", "main.c", "-o", "main"],
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

    def get_user(self):
        cookie_header = self.headers.get("Cookie", "")

        cookies = http.cookies.SimpleCookie()
        cookies.load(cookie_header)

        morsel = cookies.get(SESSION_COOKIE_NAME)
        if not morsel:
            return None

        return get_user_by_session(morsel.value)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    # ==== 只贴关键修改部分 ====

def read_json_body(self):
    try:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))
    except:
        return {}

def handle_compile(self):
    data = self.read_json_body()
    code = data.get("code", "")

    if not code.strip():
        return self.send_json({"success": False, "error": "代码不能为空"}, 400)

    # ✅ 基础安全过滤
    if "system(" in code or "fork(" in code:
        return self.send_json({
            "success": False,
            "stderr": "禁止使用危险函数"
        })

    try:
        result = local_compile_and_run(code)

    except subprocess.TimeoutExpired:
        return self.send_json({
            "success": False,
            "stderr": "程序执行超时"
        })

    except FileNotFoundError:
        return self.send_json({
            "success": False,
            "stderr": "未找到 gcc"
        }, 500)

    return self.send_json({
        "success": True,
        **result
    })


def do_POST(self):
    path = self.path

    if path.endswith("/api/ai"):
        self.handle_ai()
        return

    if path.endswith("/api/compile"):
        self.handle_compile()
        return

    self.send_json({"error": "Not Found"}, 404)