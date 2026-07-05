#define _XOPEN_SOURCE 700

#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <event2/buffer.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/http_struct.h>
#include <event2/keyvalq_struct.h>
#include <event2/util.h>
#include <fcntl.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <sqlite3.h>
#include <stdbool.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#define DEFAULT_PORT 7000
#define URL_PREFIX "/c_learning"
#define LEARN_PREFIX "/c_learning/learn"
#define EDITOR_PREFIX "/c_learning/editor"
#ifndef STATIC_DIR
#define STATIC_DIR "front"
#endif
#define DB_PATH "code_store.db"

#define SESSION_COOKIE_NAME "c_learning_session"
#define SESSION_TTL_SECONDS (24 * 3600)

#define MAX_BODY_SIZE (1024 * 1024)
#define MAX_PATH_LEN 1024
#define MAX_CMD_OUTPUT (256 * 1024)

// 统一使用 app.h 中的 struct AppState 定义
#include "app.h"

typedef struct {
  char *ptr;
  size_t len;
} Str;

static int build_path(char *dst, size_t dst_size, const char *dir,
                      const char *name);

static int parse_port(const char *value) {
  if (!value || !*value) {
    return -1;
  }

  char *end = NULL;
  long port = strtol(value, &end, 10);
  if (!end || *end != '\0' || port <= 0 || port > 65535) {
    return -1;
  }

  return (int)port;
}

// ---------------------------
// 文件说明（中文）：
// 这是一个轻量的 HTTP 后端，使用 libevent 提供 REST 接口：
// - 用户注册/登录（基于 SQLite 的 users 表）
// - 使用会话 cookie 管理登录态（sessions 表）
// - 支持代码编译/运行（在临时目录中 fork/exec）
// - 提供静态文件服务，默认目录为 web/
// 仅用于本地开发/教学示例，不适合直接在未加固的生产环境中使用。
// ---------------------------

static void str_free(Str *s) {
  if (s && s->ptr) {
    free(s->ptr);
    s->ptr = NULL;
    s->len = 0;
  }
}

static char *xstrdup(const char *s) {
  size_t n = strlen(s);
  char *out = (char *)malloc(n + 1);
  if (!out) {
    return NULL;
  }
  memcpy(out, s, n + 1);
  return out;
}

static char *strndup_local(const char *s, size_t n) {
  char *out = (char *)malloc(n + 1);
  if (!out) {
    return NULL;
  }
  memcpy(out, s, n);
  out[n] = '\0';
  return out;
}

static char *json_escape(const char *in) {
  if (!in) {
    return xstrdup("");
  }

  size_t extra = 0;
  for (const unsigned char *p = (const unsigned char *)in; *p; ++p) {
    switch (*p) {
    case '"':
    case '\\':
      extra += 1;
      break;
    case '\b':
    case '\f':
    case '\n':
    case '\r':
    case '\t':
      extra += 1;
      break;
    default:
      if (*p < 0x20) {
        extra += 5;
      }
      break;
    }
  }

  size_t n = strlen(in);
  char *out = (char *)malloc(n + extra + 1);
  if (!out) {
    return NULL;
  }

  char *w = out;
  for (const unsigned char *p = (const unsigned char *)in; *p; ++p) {
    switch (*p) {
    case '"':
      *w++ = '\\';
      *w++ = '"';
      break;
    case '\\':
      *w++ = '\\';
      *w++ = '\\';
      break;
    case '\b':
      *w++ = '\\';
      *w++ = 'b';
      break;
    case '\f':
      *w++ = '\\';
      *w++ = 'f';
      break;
    case '\n':
      *w++ = '\\';
      *w++ = 'n';
      break;
    case '\r':
      *w++ = '\\';
      *w++ = 'r';
      break;
    case '\t':
      *w++ = '\\';
      *w++ = 't';
      break;
    default:
      if (*p < 0x20) {
        snprintf(w, 7, "\\u%04x", *p);
        w += 6;
      } else {
        *w++ = (char)*p;
      }
      break;
    }
  }
  *w = '\0';
  return out;
}

static char *json_get_string(const char *json, const char *key) {
  if (!json || !key) {
    return NULL;
  }

  size_t key_len = strlen(key);
  char pattern[256];
  if (key_len + 4 >= sizeof(pattern)) {
    return NULL;
  }
  snprintf(pattern, sizeof(pattern), "\"%s\"", key);

  const char *p = json;
  while ((p = strstr(p, pattern)) != NULL) {
    p += strlen(pattern);
    while (*p && isspace((unsigned char)*p)) {
      ++p;
    }
    if (*p != ':') {
      continue;
    }
    ++p;
    while (*p && isspace((unsigned char)*p)) {
      ++p;
    }
    if (*p != '"') {
      continue;
    }
    ++p;

    char *out = (char *)malloc(strlen(p) + 1);
    if (!out) {
      return NULL;
    }
    size_t w = 0;
    bool esc = false;
    while (*p) {
      char c = *p++;
      if (esc) {
        switch (c) {
        case 'n':
          out[w++] = '\n';
          break;
        case 'r':
          out[w++] = '\r';
          break;
        case 't':
          out[w++] = '\t';
          break;
        case '\\':
          out[w++] = '\\';
          break;
        case '"':
          out[w++] = '"';
          break;
        case 'b':
          out[w++] = '\b';
          break;
        case 'f':
          out[w++] = '\f';
          break;
        case 'u':
          if (strlen(p) >= 4) {
            p += 4;
          }
          out[w++] = '?';
          break;
        default:
          out[w++] = c;
          break;
        }
        esc = false;
        continue;
      }

      if (c == '\\') {
        esc = true;
        continue;
      }
      if (c == '"') {
        out[w] = '\0';
        return out;
      }
      out[w++] = c;
    }

    free(out);
    return NULL;
  }

  return NULL;
}

// Extract a raw JSON value (string, number, object, or array) for `key`.
// Returns a malloc'd null-terminated substring containing the value (no surrounding whitespace),
// or NULL if not found. Caller must free().
static char *json_get_raw(const char *json, const char *key) {
  if (!json || !key) return NULL;
  size_t key_len = strlen(key);
  char pattern[256];
  if (key_len + 4 >= sizeof(pattern)) return NULL;
  snprintf(pattern, sizeof(pattern), "\"%s\"", key);
  const char *p = json;
  while ((p = strstr(p, pattern)) != NULL) {
    p += strlen(pattern);
    while (*p && isspace((unsigned char)*p)) ++p;
    if (*p != ':') continue;
    ++p;
    while (*p && isspace((unsigned char)*p)) ++p;
    if (!*p) return NULL;
    const char *start = p;
    if (*p == '"') {
      // string value, reuse json_get_string logic by copying until matching quote
      ++p; bool esc = false;
      while (*p) {
        if (esc) { esc = false; ++p; continue; }
        if (*p == '\\') { esc = true; ++p; continue; }
        if (*p == '"') { ++p; break; }
        ++p;
      }
      size_t len = p - start;
      char *out = (char *)malloc(len + 1);
      if (!out) return NULL;
      memcpy(out, start, len);
      out[len] = '\0';
      return out;
    } else if (*p == '{' || *p == '[') {
      // find matching brace
      char open = *p; char close = (open == '{') ? '}' : ']';
      int depth = 0;
      while (*p) {
        if (*p == open) depth++;
        else if (*p == close) {
          depth--; ++p; if (depth == 0) break;
        }
        ++p;
      }
      size_t len = p - start;
      char *out = (char *)malloc(len + 1);
      if (!out) return NULL;
      memcpy(out, start, len);
      out[len] = '\0';
      return out;
    } else {
      // number, true, false, null — read until , or } or ]
      while (*p && *p != ',' && *p != '}' && *p != ']') ++p;
      // trim trailing whitespace
      const char *end = p;
      while (end > start && isspace((unsigned char)*(end-1))) --end;
      size_t len = (size_t)(end - start);
      char *out = (char *)malloc(len + 1);
      if (!out) return NULL;
      memcpy(out, start, len);
      out[len] = '\0';
      return out;
    }
  }
  return NULL;
}

static void iso8601_utc_now(char *buf, size_t size) {
  time_t t = time(NULL);
  struct tm tmv;
  gmtime_r(&t, &tmv);
  strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", &tmv);
}

static void iso8601_utc_from_time(time_t t, char *buf, size_t size) {
  struct tm tmv;
  gmtime_r(&t, &tmv);
  strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", &tmv);
}

static time_t parse_iso8601_utc(const char *s) {
  struct tm tmv;
  memset(&tmv, 0, sizeof(tmv));
  if (!strptime(s, "%Y-%m-%dT%H:%M:%SZ", &tmv)) {
    return (time_t)-1;
  }
  char *old_tz = getenv("TZ");
  setenv("TZ", "UTC", 1);
  tzset();
  time_t t = mktime(&tmv);
  if (old_tz) {
    setenv("TZ", old_tz, 1);
  } else {
    unsetenv("TZ");
  }
  tzset();
  return t;
}

static void send_json(struct evhttp_request *req, int code, const char *json,
                      const char *set_cookie) {
  struct evbuffer *buf = evbuffer_new();
  if (!buf) {
    evhttp_send_error(req, 500, "internal");
    return;
  }
  evbuffer_add_printf(buf, "%s", json ? json : "{}");

  struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
  evhttp_add_header(headers, "Content-Type", "application/json; charset=utf-8");
  evhttp_add_header(headers, "Access-Control-Allow-Origin", "*");
  evhttp_add_header(headers, "Access-Control-Allow-Headers", "Content-Type");
  evhttp_add_header(headers, "Access-Control-Allow-Methods",
                    "GET, POST, OPTIONS");
  if (set_cookie) {
    evhttp_add_header(headers, "Set-Cookie", set_cookie);
  }
  /* discourage browser caching of JSON responses during development */
  evhttp_add_header(headers, "Cache-Control", "no-store");

  evhttp_send_reply(req, code, "OK", buf);
  evbuffer_free(buf);
}

// 发送任意二进制/字节内容（用于静态文件响应），并设置 Content-Type

static void send_file_bytes(struct evhttp_request *req, int code,
                            const unsigned char *data, size_t size,
                            const char *ctype) {
  struct evbuffer *buf = evbuffer_new();
  if (!buf) {
    evhttp_send_error(req, 500, "internal");
    return;
  }

  evbuffer_add(buf, data, size);

  struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
  evhttp_add_header(headers, "Content-Type", ctype);
  evhttp_add_header(headers, "Access-Control-Allow-Origin", "*");
  /* avoid caching static assets to prevent stale frontend JS being used */
  evhttp_add_header(headers, "Cache-Control", "no-store");

  evhttp_send_reply(req, code, "OK", buf);
  evbuffer_free(buf);
}

static void send_redirect(struct evhttp_request *req, const char *location) {
  struct evbuffer *buf = evbuffer_new();
  if (!buf) {
    evhttp_send_error(req, 500, "internal");
    return;
  }
  struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
  evhttp_add_header(headers, "Location", location);
  evhttp_add_header(headers, "Cache-Control", "no-store");
  evhttp_send_reply(req, 302, "Found", buf);
  evbuffer_free(buf);
}

static const char *guess_content_type(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) {
    return "application/octet-stream";
  }
  dot++;
  if (strcmp(dot, "html") == 0) {
    return "text/html; charset=utf-8";
  }
  if (strcmp(dot, "css") == 0) {
    return "text/css; charset=utf-8";
  }
  if (strcmp(dot, "js") == 0) {
    return "application/javascript; charset=utf-8";
  }
  if (strcmp(dot, "json") == 0) {
    return "application/json; charset=utf-8";
  }
  if (strcmp(dot, "png") == 0) {
    return "image/png";
  }
  if (strcmp(dot, "jpg") == 0 || strcmp(dot, "jpeg") == 0) {
    return "image/jpeg";
  }
  if (strcmp(dot, "svg") == 0) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

// Match a request path against an API suffix, accepting either the raw
// suffix (e.g. "/api/register") or the prefixed form with URL_PREFIX
// (e.g. "/c_learning/api/register"). Returns 1 on match, 0 otherwise.
static int path_matches(const char *path, const char *suffix) {
  if (!path || !suffix) return 0;
  if (strcmp(path, suffix) == 0) return 1;
  size_t plen = strlen(URL_PREFIX);
  if (strncmp(path, URL_PREFIX, plen) == 0) {
    const char *p = path + plen;
    if (*p == '\0') return 0;
    if (strcmp(p, suffix) == 0) return 1;
  }
  return 0;
}

static char *read_request_body(struct evhttp_request *req) {
  struct evbuffer *input = evhttp_request_get_input_buffer(req);
  size_t len = evbuffer_get_length(input);
  if (len > MAX_BODY_SIZE) {
    return NULL;
  }

  char *body = (char *)malloc(len + 1);
  if (!body) {
    return NULL;
  }

  evbuffer_copyout(input, body, len);
  body[len] = '\0';
  return body;
}

static int init_db(sqlite3 *db) {
  const char *sql_users =
      "CREATE TABLE IF NOT EXISTS users("
      "id INTEGER PRIMARY KEY AUTOINCREMENT,"
      "username TEXT UNIQUE,"
      "password_hash TEXT,"
      "created_at TEXT"
      ");";

  const char *sql_sessions =
      "CREATE TABLE IF NOT EXISTS sessions("
      "id TEXT PRIMARY KEY,"
      "user_id INTEGER,"
      "expires_at TEXT"
      ");";

  const char *sql_snippets =
      "CREATE TABLE IF NOT EXISTS snippets("
      "id INTEGER PRIMARY KEY AUTOINCREMENT,"
      "user_id INTEGER,"
      "title TEXT,"
      "language TEXT,"
      "code TEXT,"
      "created_at TEXT"
      ");";

    const char *sql_courses =
      "CREATE TABLE IF NOT EXISTS courses("
      "id INTEGER PRIMARY KEY AUTOINCREMENT,"
      "title TEXT,"
      "text TEXT,"
      "language TEXT,"
      "code TEXT,"
      "student_blocks TEXT,"
      "code_font_size INTEGER,"
      "created_at TEXT"
      ");";

  char *err = NULL;
  if (sqlite3_exec(db, sql_users, NULL, NULL, &err) != SQLITE_OK) {
    fprintf(stderr, "init users table failed: %s\n", err ? err : "unknown");
    sqlite3_free(err);
    return -1;
  }
  if (sqlite3_exec(db, sql_sessions, NULL, NULL, &err) != SQLITE_OK) {
    fprintf(stderr, "init sessions table failed: %s\n", err ? err : "unknown");
    sqlite3_free(err);
    return -1;
  }
  if (sqlite3_exec(db, sql_snippets, NULL, NULL, &err) != SQLITE_OK) {
    fprintf(stderr, "init snippets table failed: %s\n", err ? err : "unknown");
    sqlite3_free(err);
    return -1;
  }
  if (sqlite3_exec(db, sql_courses, NULL, NULL, &err) != SQLITE_OK) {
    fprintf(stderr, "init courses table failed: %s\n", err ? err : "unknown");
    sqlite3_free(err);
    return -1;
  }
  // Ensure new columns exist for migrations: student_blocks (TEXT) and code_font_size (INTEGER)
  {
    sqlite3_stmt *info = NULL;
    const char *pinfo = "PRAGMA table_info(courses)";
    int has_student_blocks = 0, has_code_font_size = 0;
    if (sqlite3_prepare_v2(db, pinfo, -1, &info, NULL) == SQLITE_OK) {
      while (sqlite3_step(info) == SQLITE_ROW) {
        const char *colname = (const char *)sqlite3_column_text(info, 1);
        if (colname) {
          if (strcmp(colname, "student_blocks") == 0) has_student_blocks = 1;
          if (strcmp(colname, "code_font_size") == 0) has_code_font_size = 1;
        }
      }
      sqlite3_finalize(info);
    }
    if (!has_student_blocks) {
      const char *alter = "ALTER TABLE courses ADD COLUMN student_blocks TEXT";
      if (sqlite3_exec(db, alter, NULL, NULL, &err) != SQLITE_OK) {
        if (err) { sqlite3_free(err); err = NULL; }
      }
    }
    if (!has_code_font_size) {
      const char *alter2 = "ALTER TABLE courses ADD COLUMN code_font_size INTEGER";
      if (sqlite3_exec(db, alter2, NULL, NULL, &err) != SQLITE_OK) {
        if (err) { sqlite3_free(err); err = NULL; }
      }
    }
  }
  return 0;
}

static int random_bytes(unsigned char *buf, size_t n) {
  return RAND_bytes(buf, (int)n) == 1 ? 0 : -1;
}

static char *hex_encode(const unsigned char *src, size_t n) {
  static const char *hex = "0123456789abcdef";
  char *out = (char *)malloc(n * 2 + 1);
  if (!out) {
    return NULL;
  }
  for (size_t i = 0; i < n; ++i) {
    out[2 * i] = hex[(src[i] >> 4) & 0x0F];
    out[2 * i + 1] = hex[src[i] & 0x0F];
  }
  out[n * 2] = '\0';
  return out;
}

static int hex_decode(const char *hexs, unsigned char *out, size_t out_len) {
  size_t n = strlen(hexs);
  if (n != out_len * 2) {
    return -1;
  }
  for (size_t i = 0; i < out_len; ++i) {
    char a = hexs[2 * i];
    char b = hexs[2 * i + 1];
    int hi = isdigit((unsigned char)a) ? a - '0' : (tolower((unsigned char)a) - 'a' + 10);
    int lo = isdigit((unsigned char)b) ? b - '0' : (tolower((unsigned char)b) - 'a' + 10);
    if (hi < 0 || hi > 15 || lo < 0 || lo > 15) {
      return -1;
    }
    out[i] = (unsigned char)((hi << 4) | lo);
  }
  return 0;
}

static char *hash_password(const char *password) {
  unsigned char salt[16];
  unsigned char digest[32];

  if (random_bytes(salt, sizeof(salt)) != 0) {
    return NULL;
  }

  if (PKCS5_PBKDF2_HMAC(password, (int)strlen(password), salt, (int)sizeof(salt),
                        100000, EVP_sha256(), (int)sizeof(digest), digest) != 1) {
    return NULL;
  }

  char *salt_hex = hex_encode(salt, sizeof(salt));
  char *dig_hex = hex_encode(digest, sizeof(digest));
  if (!salt_hex || !dig_hex) {
    free(salt_hex);
    free(dig_hex);
    return NULL;
  }

  size_t need = strlen(salt_hex) + 1 + strlen(dig_hex) + 1;
  char *out = (char *)malloc(need);
  if (!out) {
    free(salt_hex);
    free(dig_hex);
    return NULL;
  }
  snprintf(out, need, "%s:%s", salt_hex, dig_hex);
  free(salt_hex);
  free(dig_hex);
  return out;
}

// 使用与 DB 模块相同的 PBKDF2 设置验证密码，stored 格式为 salt_hex:digest_hex
static int verify_password(const char *password, const char *stored) {
  // 支持两种格式：
  // 1) 老格式：salthex:digesthex（salt 16 字节 -> 32 hex, digest 32 字节 -> 64 hex）
  // 2) Python/Django 格式：pbkdf2_sha256$iterations$salt$hash
  if (strncmp(stored, "pbkdf2_sha256$", 14) == 0) {
    // 解析 Django 风格的字段
    char *copy = xstrdup(stored);
    if (!copy) return 0;
    char *saveptr = NULL;
    strtok_r(copy, "$", &saveptr); // pbkdf2_sha256
    char *iter_s = strtok_r(NULL, "$", &saveptr);
    char *salt_hex = strtok_r(NULL, "$", &saveptr);
    char *dig_hex = strtok_r(NULL, "$", &saveptr);
    int ok = 0;
    if (iter_s && salt_hex && dig_hex) {
      int iterations = atoi(iter_s);
      unsigned char salt[64];
      unsigned char expected[64];
      size_t salt_len = strlen(salt_hex) / 2;
      size_t dig_len = strlen(dig_hex) / 2;
      if (salt_len <= sizeof(salt) && dig_len <= sizeof(expected)) {
        if (hex_decode(salt_hex, salt, salt_len) == 0) {
          unsigned char actual[64];
          if (PKCS5_PBKDF2_HMAC(password, (int)strlen(password), salt, (int)salt_len,
                                iterations, EVP_sha256(), (int)dig_len, actual) == 1) {
            if (hex_decode(dig_hex, expected, dig_len) == 0) {
              ok = (CRYPTO_memcmp(actual, expected, dig_len) == 0);
            }
          }
        }
      }
    }
    free(copy);
    return ok;
  }

  // 老格式 salt:hash
  const char *sep = strchr(stored, ':');
  if (!sep) {
    return 0;
  }

  size_t salt_hex_len = (size_t)(sep - stored);
  char *salt_hex = strndup_local(stored, salt_hex_len);
  const char *dig_hex = sep + 1;

  if (!salt_hex || strlen(salt_hex) != 32 || strlen(dig_hex) != 64) {
    free(salt_hex);
    return 0;
  }

  unsigned char salt[16];
  unsigned char expected[32];
  unsigned char actual[32];

  if (hex_decode(salt_hex, salt, sizeof(salt)) != 0 ||
      hex_decode(dig_hex, expected, sizeof(expected)) != 0) {
    free(salt_hex);
    return 0;
  }
  free(salt_hex);

  if (PKCS5_PBKDF2_HMAC(password, (int)strlen(password), salt, (int)sizeof(salt),
                        100000, EVP_sha256(), (int)sizeof(actual), actual) != 1) {
    return 0;
  }

  return CRYPTO_memcmp(actual, expected, sizeof(actual)) == 0;
}

static char *new_session_id(void) {
  unsigned char raw[32];
  if (random_bytes(raw, sizeof(raw)) != 0) {
    return NULL;
  }
  return hex_encode(raw, sizeof(raw));
}

// 从 HTTP 请求的 Cookie 头中解析指定 cookie 名称的值（返回 malloc，需要 free）。
static char *get_cookie_value(struct evhttp_request *req, const char *name) {
  const char *cookie =
      evhttp_find_header(evhttp_request_get_input_headers(req), "Cookie");
  if (!cookie) {
    return NULL;
  }

  size_t name_len = strlen(name);
  const char *p = cookie;
  while (*p) {
    while (*p == ' ' || *p == ';') {
      ++p;
    }
    if (strncmp(p, name, name_len) == 0 && p[name_len] == '=') {
      p += name_len + 1;
      const char *end = strchr(p, ';');
      if (!end) {
        end = p + strlen(p);
      }
      return strndup_local(p, (size_t)(end - p));
    }
    const char *next = strchr(p, ';');
    if (!next) {
      break;
    }
    p = next + 1;
  }
  return NULL;
}

static int create_session(sqlite3 *db, long user_id, char **sid_out) {
  char *sid = new_session_id();
  if (!sid) {
    return -1;
  }

  time_t exp_t = time(NULL) + SESSION_TTL_SECONDS;
  char exp[32];
  iso8601_utc_from_time(exp_t, exp, sizeof(exp));

  sqlite3_stmt *stmt = NULL;
  const char *sql = "INSERT INTO sessions(id, user_id, expires_at) VALUES(?,?,?)";
  if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(sid);
    return -1;
  }

  sqlite3_bind_text(stmt, 1, sid, -1, SQLITE_TRANSIENT);
  sqlite3_bind_int64(stmt, 2, user_id);
  sqlite3_bind_text(stmt, 3, exp, -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    free(sid);
    return -1;
  }

  *sid_out = sid;
  return 0;
}

// 删除会话记录（根据 sid）
static void delete_session(sqlite3 *db, const char *sid) {
  if (!sid || !*sid) {
    return;
  }
  sqlite3_stmt *stmt = NULL;
  const char *sql = "DELETE FROM sessions WHERE id = ?";
  if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) == SQLITE_OK) {
    sqlite3_bind_text(stmt, 1, sid, -1, SQLITE_TRANSIENT);
    sqlite3_step(stmt);
    sqlite3_finalize(stmt);
  }
}

typedef struct {
  long id;
  char *username;
  int ok;
} UserInfo;

static UserInfo get_user_by_session(sqlite3 *db, const char *sid) {
  UserInfo u = {0, NULL, 0};
  if (!sid || !*sid) {
    return u;
  }

  sqlite3_stmt *stmt = NULL;
  const char *sql =
      "SELECT users.id, users.username, sessions.expires_at "
      "FROM sessions JOIN users ON users.id = sessions.user_id "
      "WHERE sessions.id = ?";

  if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    return u;
  }

  sqlite3_bind_text(stmt, 1, sid, -1, SQLITE_TRANSIENT);

  if (sqlite3_step(stmt) == SQLITE_ROW) {
    long uid = (long)sqlite3_column_int64(stmt, 0);
    const char *uname = (const char *)sqlite3_column_text(stmt, 1);
    const char *exp = (const char *)sqlite3_column_text(stmt, 2);

    if (uname && exp) {
      time_t exp_t = parse_iso8601_utc(exp);
      if (exp_t > time(NULL)) {
        u.id = uid;
        u.username = xstrdup(uname);
        u.ok = u.username != NULL;
      }
    }
  }

  sqlite3_finalize(stmt);

  if (!u.ok) {
    delete_session(db, sid);
  }

  return u;
}

// 释放 UserInfo 中分配的内存并重置字段
static void user_info_free(UserInfo *u) {
  if (u && u->username) {
    free(u->username);
    u->username = NULL;
    u->ok = 0;
  }
}

static int write_file(const char *path, const char *content) {
  FILE *f = fopen(path, "wb");
  if (!f) {
    return -1;
  }
  size_t n = strlen(content);
  int ok = fwrite(content, 1, n, f) == n ? 0 : -1;
  fclose(f);
  return ok;
}

static Str read_pipe_all(int fd) {
  // 从文件描述符读取全部数据，返回包含数据的 Str（调用者需通过 str_free/free 释放 ptr）。
  Str out = {NULL, 0};
  size_t cap = 4096;
  out.ptr = (char *)malloc(cap);
  if (!out.ptr) {
    return out;
  }

  for (;;) {
    if (out.len + 2048 + 1 > cap) {
      size_t ncap = cap * 2;
      char *np = (char *)realloc(out.ptr, ncap);
      if (!np) {
        free(out.ptr);
        out.ptr = NULL;
        out.len = 0;
        return out;
      }
      out.ptr = np;
      cap = ncap;
    }

    ssize_t n = read(fd, out.ptr + out.len, cap - out.len - 1);
    if (n > 0) {
      out.len += (size_t)n;
      if (out.len > MAX_CMD_OUTPUT) {
        break;
      }
      continue;
    }
    if (n == 0) {
      break;
    }
    if (errno == EINTR) {
      continue;
    }
    break;
  }

  out.ptr[out.len] = '\0';
  return out;
}

static int run_process(const char *cwd, char *const argv[], const char *stdin_text,
                       Str *stdout_out, Str *stderr_out, int timeout_sec,
                       int *exit_code) {
  // 在 cwd 目录中 fork/exec 指定命令，捕获 stdout/stderr，并支持超时机制。
  int out_pipe[2];
  int err_pipe[2];
  int in_pipe[2];
  if (pipe(out_pipe) != 0 || pipe(err_pipe) != 0 || pipe(in_pipe) != 0) {
    return -1;
  }

  pid_t pid = fork();
  if (pid < 0) {
    return -1;
  }

  if (pid == 0) {
    if (chdir(cwd) != 0) {
      _exit(127);
    }

    dup2(in_pipe[0], STDIN_FILENO);
    dup2(out_pipe[1], STDOUT_FILENO);
    dup2(err_pipe[1], STDERR_FILENO);

    close(in_pipe[1]);
    close(out_pipe[0]);
    close(err_pipe[0]);

    execvp(argv[0], argv);
    _exit(127);
  }

  close(in_pipe[0]);
  close(out_pipe[1]);
  close(err_pipe[1]);

  if (stdin_text && *stdin_text) {
    write(in_pipe[1], stdin_text, strlen(stdin_text));
  }
  close(in_pipe[1]);

  time_t start = time(NULL);
  int status = 0;
  while (waitpid(pid, &status, WNOHANG) == 0) {
    if (time(NULL) - start > timeout_sec) {
      kill(pid, SIGKILL);
      waitpid(pid, &status, 0);
      break;
    }
    struct timespec sleep_for = {0, 20 * 1000 * 1000};
    nanosleep(&sleep_for, NULL);
  }

  *stdout_out = read_pipe_all(out_pipe[0]);
  *stderr_out = read_pipe_all(err_pipe[0]);
  close(out_pipe[0]);
  close(err_pipe[0]);

  if (WIFEXITED(status)) {
    *exit_code = WEXITSTATUS(status);
  } else {
    *exit_code = 1;
  }
  return 0;
}

static int make_temp_dir(char *buf, size_t size) {
  snprintf(buf, size, "/tmp/c_learning_XXXXXX");
  return mkdtemp(buf) ? 0 : -1;
}

static void remove_tree_simple(const char *dir) {
  char cmd[MAX_PATH_LEN + 32];
  snprintf(cmd, sizeof(cmd), "rm -rf '%s'", dir);
  system(cmd);
}

// 编译检查：在临时目录写入源码并尝试编译/语法检查，返回 JSON 格式的结果字符串（malloc）。
// 仅执行“编译/语法检查”步骤，不运行二进制。
static char *compile_only_json(const char *code, const char *language) {
  char tmp[MAX_PATH_LEN];
  if (make_temp_dir(tmp, sizeof(tmp)) != 0) {
    return xstrdup("{\"success\":false,\"stderr\":\"temp dir failed\"}");
  }

  const char *src_name = NULL;
  char *const *cmd = NULL;
  char *cmd_c[] = {"gcc", "main.c", "-o", "main", NULL};
  char *cmd_cpp[] = {"g++", "main.cpp", "-o", "main", NULL};
  char *cmd_py[] = {"python3", "-m", "py_compile", "main.py", NULL};
  char *cmd_js[] = {"node", "--check", "main.js", NULL};

  if (strcmp(language, "C") == 0) {
    src_name = "main.c";
    cmd = cmd_c;
  } else if (strcmp(language, "C++") == 0) {
    src_name = "main.cpp";
    cmd = cmd_cpp;
  } else if (strcmp(language, "Python") == 0) {
    src_name = "main.py";
    cmd = cmd_py;
  } else if (strcmp(language, "JavaScript") == 0) {
    src_name = "main.js";
    cmd = cmd_js;
  } else {
    return xstrdup("{\"success\":false,\"stderr\":\"unsupported language\"}");
  }

  char src_path[MAX_PATH_LEN];
  if (build_path(src_path, sizeof(src_path), tmp, src_name) != 0) {
    remove_tree_simple(tmp);
    return xstrdup("{\"success\":false,\"stderr\":\"path too long\"}");
  }
  if (write_file(src_path, code) != 0) {
    remove_tree_simple(tmp);
    return xstrdup("{\"success\":false,\"stderr\":\"write source failed\"}");
  }

  Str out = {NULL, 0};
  Str err = {NULL, 0};
  int ec = 1;
  run_process(tmp, (char *const *)cmd, "", &out, &err, 5, &ec);

  char *esc_out = json_escape(out.ptr ? out.ptr : "");
  char *esc_err = json_escape(err.ptr ? err.ptr : "");
  char *resp = NULL;

  if (esc_out && esc_err) {
    size_t need = strlen(esc_out) + strlen(esc_err) + 80;
    resp = (char *)malloc(need);
    if (resp) {
      snprintf(resp, need,
               "{\"success\":%s,\"stdout\":\"%s\",\"stderr\":\"%s\"}",
               ec == 0 ? "true" : "false", esc_out, esc_err);
    }
  }

  free(esc_out);
  free(esc_err);
  str_free(&out);
  str_free(&err);
  remove_tree_simple(tmp);

  if (!resp) {
    resp = xstrdup("{\"success\":false,\"stderr\":\"internal error\"}");
  }
  return resp;
}

// 编译并运行：如果需要先编译（如 C/C++），先执行编译步骤，成功后运行程序并收集 stdout/stderr。
// 返回 malloc 分配的 JSON 字符串，调用者需 free。
static char *compile_run_json(const char *code, const char *stdin_text,
                              const char *language) {
  char tmp[MAX_PATH_LEN];
  if (make_temp_dir(tmp, sizeof(tmp)) != 0) {
    return xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"temp dir failed\"}");
  }

  const char *src_name = NULL;
  char *const *build_cmd = NULL;
  char *const *run_cmd = NULL;

  char *build_c[] = {"gcc", "main.c", "-o", "main", NULL};
  char *build_cpp[] = {"g++", "main.cpp", "-o", "main", NULL};
  char *run_bin[] = {"./main", NULL};

  char *run_py[] = {"python3", "main.py", NULL};
  char *run_js[] = {"node", "main.js", NULL};

  if (strcmp(language, "C") == 0) {
    src_name = "main.c";
    build_cmd = build_c;
    run_cmd = run_bin;
  } else if (strcmp(language, "C++") == 0) {
    src_name = "main.cpp";
    build_cmd = build_cpp;
    run_cmd = run_bin;
  } else if (strcmp(language, "Python") == 0) {
    src_name = "main.py";
    run_cmd = run_py;
  } else if (strcmp(language, "JavaScript") == 0) {
    src_name = "main.js";
    run_cmd = run_js;
  } else {
    return xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"unsupported language\"}");
  }

  char src_path[MAX_PATH_LEN];
  if (build_path(src_path, sizeof(src_path), tmp, src_name) != 0) {
    remove_tree_simple(tmp);
    return xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"path too long\"}");
  }
  if (write_file(src_path, code) != 0) {
    remove_tree_simple(tmp);
    return xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"write source failed\"}");
  }

  Str out = {NULL, 0};
  Str err = {NULL, 0};
  int ec = 1;

  if (build_cmd) {
    run_process(tmp, (char *const *)build_cmd, "", &out, &err, 5, &ec);
    if (ec != 0) {
      char *esc_err = json_escape(err.ptr ? err.ptr : "");
      char *resp = NULL;
      if (esc_err) {
        size_t need = strlen(esc_err) + 80;
        resp = (char *)malloc(need);
        if (resp) {
          snprintf(resp, need,
                   "{\"success\":false,\"stdout\":\"\",\"stderr\":\"%s\"}",
                   esc_err);
        }
      }
      free(esc_err);
      str_free(&out);
      str_free(&err);
      remove_tree_simple(tmp);
      return resp ? resp : xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"internal error\"}");
    }
    str_free(&out);
    str_free(&err);
  }

  run_process(tmp, (char *const *)run_cmd, stdin_text ? stdin_text : "", &out, &err,
              5, &ec);

  char *esc_out = json_escape(out.ptr ? out.ptr : "");
  char *esc_err = json_escape(err.ptr ? err.ptr : "");
  char *resp = NULL;
  if (esc_out && esc_err) {
    size_t need = strlen(esc_out) + strlen(esc_err) + 90;
    resp = (char *)malloc(need);
    if (resp) {
      snprintf(resp, need,
               "{\"success\":%s,\"stdout\":\"%s\",\"stderr\":\"%s\"}",
               ec == 0 ? "true" : "false", esc_out, esc_err);
    }
  }

  free(esc_out);
  free(esc_err);
  str_free(&out);
  str_free(&err);
  remove_tree_simple(tmp);

  return resp ? resp : xstrdup("{\"success\":false,\"stdout\":\"\",\"stderr\":\"internal error\"}");
}

static char *query_param(const char *uri, const char *key) {
  const char *q = strchr(uri, '?');
  if (!q) {
    return NULL;
  }
  ++q;
  size_t key_len = strlen(key);

  while (*q) {
    const char *amp = strchr(q, '&');
    size_t seg_len = amp ? (size_t)(amp - q) : strlen(q);
    const char *eq = memchr(q, '=', seg_len);
    if (eq) {
      size_t klen = (size_t)(eq - q);
      if (klen == key_len && strncmp(q, key, key_len) == 0) {
        return strndup_local(eq + 1, seg_len - klen - 1);
      }
    }
    if (!amp) {
      break;
    }
    q = amp + 1;
  }
  return NULL;
}

static char *path_join(const char *a, const char *b) {
  size_t n = strlen(a);
  size_t m = strlen(b);
  bool need_slash = n > 0 && a[n - 1] != '/';
  char *out = (char *)malloc(n + m + (need_slash ? 2 : 1));
  if (!out) {
    return NULL;
  }
  strcpy(out, a);
  if (need_slash) {
    strcat(out, "/");
  }
  strcat(out, b);
  return out;
}

static int build_path(char *dst, size_t dst_size, const char *dir,
                      const char *name) {
  int written = snprintf(dst, dst_size, "%s/%s", dir, name);
  if (written < 0 || (size_t)written >= dst_size) {
    return -1;
  }
  return 0;
}

static bool is_safe_rel_path(const char *p) {
  if (!p || !*p) {
    return false;
  }
  if (strstr(p, "..")) {
    return false;
  }
  if (*p == '/') {
    return false;
  }
  return true;
}

// 简化的静态文件服务：根据请求路径解析相对文件并返回内容。
// 注意：只对简单场景有效，没有复杂的缓存/安全策略。
// ---------------------------
// API 处理函数（/api/*）
// 每个 handle_* 函数负责解析请求、访问 DB、执行逻辑并返回 JSON。
// ---------------------------
static void serve_static(AppState *app, struct evhttp_request *req,
                         const char *uri_path) {
  const char *rel = NULL;
  const char *static_dir = NULL;
  size_t learn_len = strlen(LEARN_PREFIX);
  size_t editor_len = strlen(EDITOR_PREFIX);

  if (strncmp(uri_path, LEARN_PREFIX, learn_len) == 0 &&
      (uri_path[learn_len] == '\0' || uri_path[learn_len] == '/')) {
    rel = uri_path + learn_len;
    if (*rel == '/') rel++;
    if (*rel == '\0') rel = "index.html";
    static_dir = "front";
  } else if (strncmp(uri_path, EDITOR_PREFIX, editor_len) == 0 &&
             (uri_path[editor_len] == '\0' || uri_path[editor_len] == '/')) {
    rel = uri_path + editor_len;
    if (*rel == '/') rel++;
    if (*rel == '\0') rel = "index.html";
    static_dir = "site";
  } else {
    evhttp_send_error(req, 404, "not found");
    return;
  }

  if (!is_safe_rel_path(rel)) {
    send_json(req, 400, "{\"success\":false,\"error\":\"bad path\"}", NULL);
    return;
  }

  char *root = path_join(app->base_dir, static_dir);
  char *full = root ? path_join(root, rel) : NULL;

  if (!full) {
    free(root);
    evhttp_send_error(req, 500, "internal");
    return;
  }

  FILE *f = fopen(full, "rb");
  if (!f) {
    free(root);
    free(full);
    evhttp_send_error(req, 404, "not found");
    return;
  }

  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  fseek(f, 0, SEEK_SET);

  if (sz < 0) {
    fclose(f);
    free(root);
    free(full);
    evhttp_send_error(req, 500, "internal");
    return;
  }

  unsigned char *buf = (unsigned char *)malloc((size_t)sz);
  if (!buf) {
    fclose(f);
    free(root);
    free(full);
    evhttp_send_error(req, 500, "internal");
    return;
  }

  size_t got = fread(buf, 1, (size_t)sz, f);
  fclose(f);
  if (got != (size_t)sz) {
    free(buf);
    free(root);
    free(full);
    evhttp_send_error(req, 500, "internal");
    return;
  }

  send_file_bytes(req, 200, buf, (size_t)sz, guess_content_type(full));

  free(buf);
  free(root);
  free(full);
}

static void handle_register(AppState *app, struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) {
    send_json(req, 400, "{\"success\":false,\"error\":\"bad body\"}", NULL);
    return;
  }

  char *username = json_get_string(body, "username");
  char *password = json_get_string(body, "password");
  free(body);

  /* Log the registration attempt (username only) for debugging */
  if (username) {
    fprintf(stderr, "REGISTER DEBUG: username='%s'\n", username);
  } else {
    fprintf(stderr, "REGISTER DEBUG: username=NULL\n");
  }

  if (!username || strlen(username) == 0) {
    free(username);
    free(password);
    send_json(req, 400,
              "{\"success\":false,\"error\":\"\\u7528\\u6237\\u540d\\u4e0d\\u80fd\\u4e3a\\u7a7a\"}",
              NULL);
    return;
  }
  if (!password || strlen(password) < 6) {
    free(username);
    free(password);
    send_json(req, 400,
              "{\"success\":false,\"error\":\"\\u5bc6\\u7801\\u81f3\\u5c11 6 \\\u4f4d\"}",
              NULL);
    return;
  }

  char *ph = hash_password(password);
  if (!ph) {
    free(username);
    free(password);
    send_json(req, 500, "{\"success\":false,\"error\":\"hash failed\"}", NULL);
    return;
  }

  char now[32];
  iso8601_utc_now(now, sizeof(now));

  sqlite3_stmt *stmt = NULL;
  const char *sql = "INSERT INTO users(username, password_hash, created_at) VALUES(?,?,?)";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(username);
    free(password);
    free(ph);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  sqlite3_bind_text(stmt, 1, username, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, ph, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, now, -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);

  long new_user_id = 0;
  if (rc == SQLITE_DONE) {
    /* fetch last insert id and try to create a session so user is auto-logged-in */
    sqlite3_int64 rowid = sqlite3_last_insert_rowid(app->db);
    if (rowid > 0) new_user_id = (long)rowid;
  }

  free(username);
  free(password);
  free(ph);

  if (rc != SQLITE_DONE) {
    send_json(req, 400,
              "{\"success\":false,\"error\":\"\\u7528\\u6237\\u540d\\u5df2\\u5b58\\u5728\"}",
              NULL);
    return;
  }

  /* create session and return cookie so frontend recognizes logged-in user */
  char *sid = NULL;
  if (new_user_id > 0 && create_session(app->db, new_user_id, &sid) == 0 && sid) {
    char cookie[512];
    snprintf(cookie, sizeof(cookie), "%s=%s; Path=/; HttpOnly", SESSION_COOKIE_NAME, sid);
    send_json(req, 200, "{\"success\":true}", cookie);
    free(sid);
    return;
  }

  /* fallback: registration succeeded but session creation failed */
  send_json(req, 200, "{\"success\":true}", NULL);
}

static void handle_login(AppState *app, struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) {
    send_json(req, 400, "{\"success\":false,\"error\":\"bad body\"}", NULL);
    return;
  }

  char *username = json_get_string(body, "username");
  char *password = json_get_string(body, "password");
  free(body);

  if (!username || !password) {
    free(username);
    free(password);
    send_json(req, 401,
              "{\"success\":false,\"error\":\"\\u767b\\u5f55\\u5931\\u8d25\"}",
              NULL);
    return;
  }

  sqlite3_stmt *stmt = NULL;
  const char *sql = "SELECT id, password_hash FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(username);
    free(password);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  sqlite3_bind_text(stmt, 1, username, -1, SQLITE_TRANSIENT);

  long uid = 0;
  char *stored = NULL;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    uid = (long)sqlite3_column_int64(stmt, 0);
    const char *p = (const char *)sqlite3_column_text(stmt, 1);
    if (p) {
      stored = xstrdup(p);
    }
  }
  sqlite3_finalize(stmt);

  int ok = stored && verify_password(password, stored);
  free(stored);
  free(username);
  free(password);

  if (!ok) {
    send_json(req, 401,
              "{\"success\":false,\"error\":\"\\u767b\\u5f55\\u5931\\u8d25\"}",
              NULL);
    return;
  }

  char *sid = NULL;
  if (create_session(app->db, uid, &sid) != 0 || !sid) {
    send_json(req, 500, "{\"success\":false,\"error\":\"create session failed\"}",
              NULL);
    free(sid);
    return;
  }

  char cookie[512];
  snprintf(cookie, sizeof(cookie), "%s=%s; Path=/; HttpOnly", SESSION_COOKIE_NAME,
           sid);
  free(sid);

  send_json(req, 200, "{\"success\":true}", cookie);
}

// ========== 课程 API ==========
static void handle_courses_list(AppState *app, struct evhttp_request *req) {
  sqlite3_stmt *stmt = NULL;
  const char *sql = "SELECT id, title, created_at FROM courses ORDER BY id DESC";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  size_t bufcap = 1024;
  char *out = (char *)malloc(bufcap);
  if (!out) {
    sqlite3_finalize(stmt);
    send_json(req, 500, "{\"success\":false,\"error\":\"internal\"}", NULL);
    return;
  }
  strcpy(out, "{\"success\":true,\"items\":[");
  size_t len = strlen(out);

  int first = 1;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    long id = (long)sqlite3_column_int64(stmt, 0);
    const char *title = (const char *)sqlite3_column_text(stmt, 1);
    const char *created = (const char *)sqlite3_column_text(stmt, 2);
    char *et = json_escape(title ? title : "");
    char *ec = json_escape(created ? created : "");
    if (!et || !ec) {
      free(et); free(ec); continue;
    }
    char item[1024];
    snprintf(item, sizeof(item), "%s{\"id\":%ld,\"title\":\"%s\",\"created_at\":\"%s\"}", first ? "" : ",", id, et, ec);
    size_t need = len + strlen(item) + 10;
    if (need > bufcap) {
      bufcap = need * 2;
      char *n = realloc(out, bufcap);
      if (!n) break;
      out = n;
    }
    strcat(out, item);
    len = strlen(out);
    first = 0;
    free(et); free(ec);
  }

  sqlite3_finalize(stmt);
  strcat(out, "]}");
  send_json(req, 200, out, NULL);
  free(out);
}

static void handle_course_get(AppState *app, struct evhttp_request *req, const char *uri) {
  char *q = query_param(uri, "id");
  if (!q) {
    send_json(req, 400, "{\"success\":false,\"error\":\"missing id\"}", NULL);
    return;
  }
  sqlite3_stmt *stmt = NULL;
  const char *sql = "SELECT id, title, text, language, code, student_blocks, code_font_size, created_at FROM courses WHERE id = ?";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(q);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }
  sqlite3_bind_int64(stmt, 1, atoll(q));
  free(q);
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    sqlite3_finalize(stmt);
    send_json(req, 404, "{\"success\":false,\"error\":\"not found\"}", NULL);
    return;
  }
  long id = (long)sqlite3_column_int64(stmt, 0);
  const char *title = (const char *)sqlite3_column_text(stmt, 1);
  const char *text = (const char *)sqlite3_column_text(stmt, 2);
  const char *language = (const char *)sqlite3_column_text(stmt, 3);
  const char *code = (const char *)sqlite3_column_text(stmt, 4);
  const char *student_blocks = (const char *)sqlite3_column_text(stmt, 5);
  int code_font_size = sqlite3_column_type(stmt,6) == SQLITE_NULL ? 0 : sqlite3_column_int(stmt,6);
  const char *created = (const char *)sqlite3_column_text(stmt, 7);

  char *et = json_escape(title ? title : "");
  char *etx = json_escape(text ? text : "");
  char *elang = json_escape(language ? language : "");
  char *ecode = json_escape(code ? code : "");
  char *ec = json_escape(created ? created : "");
  char *sblocks_raw = NULL;
  if (student_blocks && *student_blocks) {
    sblocks_raw = xstrdup(student_blocks);
  } else {
    sblocks_raw = xstrdup("[]");
  }
  sqlite3_finalize(stmt);

  size_t need = strlen(et) + strlen(etx) + strlen(elang) + strlen(ecode) + strlen(ec) + strlen(sblocks_raw) + 300;
  char *out = (char *)malloc(need);
  if (!out) {
    free(et); free(etx); free(elang); free(ecode); free(ec);
    send_json(req, 500, "{\"success\":false,\"error\":\"internal\"}", NULL);
    return;
  }
  if (code_font_size > 0) {
    snprintf(out, need, "{\"success\":true,\"item\":{\"id\":%ld,\"title\":\"%s\",\"text\":\"%s\",\"language\":\"%s\",\"code\":\"%s\",\"student_blocks\":%s,\"code_font_size\":%d,\"created_at\":\"%s\"}}", id, et, etx, elang, ecode, sblocks_raw, code_font_size, ec);
  } else {
    snprintf(out, need, "{\"success\":true,\"item\":{\"id\":%ld,\"title\":\"%s\",\"text\":\"%s\",\"language\":\"%s\",\"code\":\"%s\",\"student_blocks\":%s,\"created_at\":\"%s\"}}", id, et, etx, elang, ecode, sblocks_raw, ec);
  }
  send_json(req, 200, out, NULL);
  free(out);
  free(et); free(etx); free(elang); free(ecode); free(ec);
  free(sblocks_raw);
}

static void handle_course_save(AppState *app, struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) { send_json(req, 400, "{\"success\":false,\"error\":\"bad body\"}", NULL); return; }
  char *id_s = json_get_string(body, "id");
  char *title = json_get_string(body, "title");
  char *text = json_get_string(body, "text");
  char *code = json_get_string(body, "code");
  char *lang = json_get_string(body, "language");
  char *student_blocks_raw = json_get_raw(body, "student_blocks");
  char *code_font_raw = json_get_string(body, "code_font_size");
  if (!code_font_raw) {
    code_font_raw = json_get_raw(body, "code_font_size");
  }
  free(body);

  char now[32]; iso8601_utc_now(now, sizeof(now));

  if (!title) title = xstrdup("");
  if (!text) text = xstrdup("");
  if (!code) code = xstrdup("");
  if (!lang) lang = xstrdup("");
  if (!student_blocks_raw) student_blocks_raw = xstrdup("[]");

  if (id_s && strlen(id_s)>0) {
    sqlite3_stmt *stmt = NULL;
    const char *sql = "UPDATE courses SET title=?, text=?, language=?, code=?, student_blocks=?, code_font_size=? WHERE id=?";
    if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) == SQLITE_OK) {
      sqlite3_bind_text(stmt,1,title,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,2,text,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,3,lang,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,4,code,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,5,student_blocks_raw,-1,SQLITE_TRANSIENT);
      if (code_font_raw) sqlite3_bind_int(stmt,6,atoi(code_font_raw)); else sqlite3_bind_null(stmt,6);
      sqlite3_bind_int64(stmt,7,atoll(id_s));
      sqlite3_step(stmt);
      sqlite3_finalize(stmt);
      send_json(req, 200, "{\"success\":true}", NULL);
    } else {
      send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    }
  } else {
    sqlite3_stmt *stmt = NULL;
    const char *sql = "INSERT INTO courses(title,text,language,code,student_blocks,code_font_size,created_at) VALUES(?,?,?,?,?,?,?)";
    if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) == SQLITE_OK) {
      sqlite3_bind_text(stmt,1,title,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,2,text,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,3,lang,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,4,code,-1,SQLITE_TRANSIENT);
      sqlite3_bind_text(stmt,5,student_blocks_raw,-1,SQLITE_TRANSIENT);
      if (code_font_raw) sqlite3_bind_int(stmt,6,atoi(code_font_raw)); else sqlite3_bind_null(stmt,6);
      sqlite3_bind_text(stmt,7,now,-1,SQLITE_TRANSIENT);
      sqlite3_step(stmt);
      sqlite3_finalize(stmt);
      send_json(req, 200, "{\"success\":true}", NULL);
    } else {
      send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    }
  }

  free(id_s); free(title); free(text); free(code); free(lang);
  free(student_blocks_raw); if (code_font_raw) free(code_font_raw);
}

static void handle_logout(AppState *app, struct evhttp_request *req) {
  char *sid = get_cookie_value(req, SESSION_COOKIE_NAME);
  if (sid) {
    delete_session(app->db, sid);
    free(sid);
  }

  char cookie[512];
  snprintf(cookie, sizeof(cookie),
           "%s=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT", SESSION_COOKIE_NAME);

  send_json(req, 200, "{\"success\":true}", cookie);
}

static UserInfo require_user(AppState *app, struct evhttp_request *req, bool *ok_sent) {
  UserInfo u = {0, NULL, 0};
  char *sid = get_cookie_value(req, SESSION_COOKIE_NAME);
  u = get_user_by_session(app->db, sid);
  free(sid);

  if (!u.ok) {
    send_json(req, 401,
              "{\"success\":false,\"error\":\"\\u672a\\u767b\\u5f55\"}",
              NULL);
    *ok_sent = true;
    return u;
  }

  *ok_sent = false;
  return u;
}

static void handle_me(AppState *app, struct evhttp_request *req) {
  char *sid = get_cookie_value(req, SESSION_COOKIE_NAME);
  UserInfo u = get_user_by_session(app->db, sid);
  free(sid);

  if (u.ok) {
    char *esc = json_escape(u.username);
    char *resp = NULL;
    if (esc) {
      size_t need = strlen(esc) + 80;
      resp = (char *)malloc(need);
      if (resp) {
        snprintf(resp, need,
                 "{\"success\":true,\"authenticated\":true,\"username\":\"%s\"}",
                 esc);
      }
      free(esc);
    }
    send_json(req, 200,
              resp ? resp
                   : "{\"success\":true,\"authenticated\":true,\"username\":null}",
              NULL);
    free(resp);
  } else {
    send_json(req, 200,
              "{\"success\":true,\"authenticated\":false,\"username\":null}",
              NULL);
  }

  user_info_free(&u);
}

static void handle_check(struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) {
    send_json(req, 400, "{\"success\":false,\"stderr\":\"bad body\"}", NULL);
    return;
  }

  char *code = json_get_string(body, "code");
  char *lang = json_get_string(body, "language");
  free(body);

  if (!code) {
    code = xstrdup("");
  }
  if (!lang) {
    lang = xstrdup("C");
  }

  char *resp = compile_only_json(code, lang);
  send_json(req, 200, resp ? resp : "{\"success\":false}", NULL);

  free(resp);
  free(code);
  free(lang);
}

static void handle_compile(struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) {
    send_json(req, 400,
              "{\"success\":false,\"stdout\":\"\",\"stderr\":\"bad body\"}",
              NULL);
    return;
  }

  char *code = json_get_string(body, "code");
  char *stdin_text = json_get_string(body, "stdin");
  char *lang = json_get_string(body, "language");
  free(body);

  if (!code) {
    code = xstrdup("");
  }
  if (!stdin_text) {
    stdin_text = xstrdup("");
  }
  if (!lang) {
    lang = xstrdup("C");
  }

  char *resp = compile_run_json(code, stdin_text, lang);
  send_json(req, 200, resp ? resp : "{\"success\":false}", NULL);

  free(resp);
  free(code);
  free(stdin_text);
  free(lang);
}

static void handle_ai(struct evhttp_request *req) {
  char *body = read_request_body(req);
  if (!body) {
    send_json(req, 400,
              "{\"success\":false,\"error\":\"bad body\"}",
              NULL);
    return;
  }

  char *question = json_get_string(body, "question");
  free(body);
  if (!question) {
    question = xstrdup("");
  }

  char *esc_q = json_escape(question);
  free(question);

  char *resp = NULL;
  if (esc_q) {
    const char *tail =
        "\\n\\n\\u76ee\\u524d\\u540e\\u7aef AI \\\u63a5\\u53e3\\u5df2\\u6253\\u901a\\uff0c\\u4f46\\u8fd8\\u6ca1\\u6709\\u63a5\\u5165\\u771f\\u5b9e\\u5927\\u6a21\\u578b\\u3002";
    size_t need = strlen(esc_q) + strlen(tail) + 120;
    resp = (char *)malloc(need);
    if (resp) {
      snprintf(resp, need,
               "{\"success\":true,\"answer\":\"\\u4f60\\u95ee\\u7684\\u662f\\uff1a%s%s\"}",
               esc_q, tail);
    }
  }

  send_json(req, 200,
            resp ? resp
                 : "{\"success\":true,\"answer\":\"AI placeholder\"}",
            NULL);

  free(esc_q);
  free(resp);
}

static void handle_save(AppState *app, struct evhttp_request *req) {
  bool sent = false;
  UserInfo u = require_user(app, req, &sent);
  if (sent) {
    return;
  }

  char *body = read_request_body(req);
  if (!body) {
    user_info_free(&u);
    send_json(req, 400, "{\"success\":false,\"error\":\"bad body\"}", NULL);
    return;
  }

  char *title = json_get_string(body, "title");
  char *lang = json_get_string(body, "language");
  char *code = json_get_string(body, "code");
  free(body);

  if (!title || strlen(title) == 0) {
    free(title);
    free(lang);
    free(code);
    user_info_free(&u);
    send_json(req, 400,
              "{\"success\":false,\"error\":\"\\u6807\\u9898\\u4e0d\\u80fd\\u4e3a\\u7a7a\"}",
              NULL);
    return;
  }
  if (!lang) {
    lang = xstrdup("C");
  }
  if (!code) {
    code = xstrdup("");
  }

  char now[32];
  iso8601_utc_now(now, sizeof(now));

  sqlite3_stmt *stmt = NULL;
  const char *sql =
      "INSERT INTO snippets(user_id, title, language, code, created_at) VALUES(?,?,?,?,?)";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(title);
    free(lang);
    free(code);
    user_info_free(&u);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  sqlite3_bind_int64(stmt, 1, u.id);
  sqlite3_bind_text(stmt, 2, title, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, lang, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, code, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, now, -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);

  if (rc != SQLITE_DONE) {
    free(title);
    free(lang);
    free(code);
    user_info_free(&u);
    send_json(req, 500, "{\"success\":false,\"error\":\"db step failed\"}", NULL);
    return;
  }

  long sid = (long)sqlite3_last_insert_rowid(app->db);

  char resp[128];
  snprintf(resp, sizeof(resp), "{\"success\":true,\"id\":%ld}", sid);
  send_json(req, 200, resp, NULL);

  free(title);
  free(lang);
  free(code);
  user_info_free(&u);
}

static void handle_list(AppState *app, struct evhttp_request *req) {
  bool sent = false;
  UserInfo u = require_user(app, req, &sent);
  if (sent) {
    return;
  }

  sqlite3_stmt *stmt = NULL;
  const char *sql =
      "SELECT id, title, language, created_at FROM snippets "
      "WHERE user_id = ? ORDER BY id DESC";
  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    user_info_free(&u);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  sqlite3_bind_int64(stmt, 1, u.id);

  Str items = {xstrdup(""), 0};
  bool first = true;

  while (sqlite3_step(stmt) == SQLITE_ROW) {
    long id = (long)sqlite3_column_int64(stmt, 0);
    const char *title = (const char *)sqlite3_column_text(stmt, 1);
    const char *lang = (const char *)sqlite3_column_text(stmt, 2);
    const char *created = (const char *)sqlite3_column_text(stmt, 3);

    char *e_title = json_escape(title ? title : "");
    char *e_lang = json_escape(lang ? lang : "");
    char *e_created = json_escape(created ? created : "");

    if (!e_title || !e_lang || !e_created) {
      free(e_title);
      free(e_lang);
      free(e_created);
      continue;
    }

    char entry[2048];
    snprintf(entry, sizeof(entry),
             "%s{\"id\":%ld,\"title\":\"%s\",\"language\":\"%s\",\"created_at\":\"%s\"}",
             first ? "" : ",", id, e_title, e_lang, e_created);
    first = false;

    size_t old_len = items.ptr ? strlen(items.ptr) : 0;
    size_t add = strlen(entry);
    char *np = (char *)realloc(items.ptr, old_len + add + 1);
    if (np) {
      items.ptr = np;
      memcpy(items.ptr + old_len, entry, add + 1);
      items.len = old_len + add;
    }

    free(e_title);
    free(e_lang);
    free(e_created);
  }

  sqlite3_finalize(stmt);

  if (!items.ptr) {
    items.ptr = xstrdup("");
  }

  size_t need = strlen(items.ptr) + 40;
  char *resp = (char *)malloc(need);
  if (resp) {
    snprintf(resp, need, "{\"success\":true,\"items\":[%s]}", items.ptr);
    send_json(req, 200, resp, NULL);
    free(resp);
  } else {
    send_json(req, 200, "{\"success\":true,\"items\":[]}", NULL);
  }

  free(items.ptr);
  user_info_free(&u);
}

static void handle_snippet(AppState *app, struct evhttp_request *req,
                           const char *uri) {
  bool sent = false;
  UserInfo u = require_user(app, req, &sent);
  if (sent) {
    return;
  }

  char *id_s = query_param(uri, "id");
  if (!id_s || strlen(id_s) == 0) {
    free(id_s);
    user_info_free(&u);
    send_json(req, 400,
              "{\"success\":false,\"error\":\"\\u7f3a\\u5c11 id\"}",
              NULL);
    return;
  }

  sqlite3_stmt *stmt = NULL;
  const char *sql =
      "SELECT id, title, language, code, created_at FROM snippets "
      "WHERE id = ? AND user_id = ?";

  if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL) != SQLITE_OK) {
    free(id_s);
    user_info_free(&u);
    send_json(req, 500, "{\"success\":false,\"error\":\"db prepare failed\"}", NULL);
    return;
  }

  sqlite3_bind_int64(stmt, 1, atoll(id_s));
  sqlite3_bind_int64(stmt, 2, u.id);

  int rc = sqlite3_step(stmt);
  if (rc != SQLITE_ROW) {
    sqlite3_finalize(stmt);
    free(id_s);
    user_info_free(&u);
    send_json(req, 404,
              "{\"success\":false,\"error\":\"\\u672a\\u627e\\u5230\\u4ee3\\u7801\\u7247\\u6bb5\"}",
              NULL);
    return;
  }

  long id = (long)sqlite3_column_int64(stmt, 0);
  const char *title = (const char *)sqlite3_column_text(stmt, 1);
  const char *lang = (const char *)sqlite3_column_text(stmt, 2);
  const char *code = (const char *)sqlite3_column_text(stmt, 3);
  const char *created = (const char *)sqlite3_column_text(stmt, 4);

  char *e_title = json_escape(title ? title : "");
  char *e_lang = json_escape(lang ? lang : "");
  char *e_code = json_escape(code ? code : "");
  char *e_created = json_escape(created ? created : "");

  sqlite3_finalize(stmt);
  free(id_s);

  if (!e_title || !e_lang || !e_code || !e_created) {
    free(e_title);
    free(e_lang);
    free(e_code);
    free(e_created);
    user_info_free(&u);
    send_json(req, 500, "{\"success\":false,\"error\":\"internal\"}", NULL);
    return;
  }

  size_t need = strlen(e_title) + strlen(e_lang) + strlen(e_code) + strlen(e_created) +
                140;
  char *resp = (char *)malloc(need);
  if (resp) {
    snprintf(resp, need,
             "{\"success\":true,\"item\":{\"id\":%ld,\"title\":\"%s\",\"language\":\"%s\",\"code\":\"%s\",\"created_at\":\"%s\"}}",
             id, e_title, e_lang, e_code, e_created);
    send_json(req, 200, resp, NULL);
    free(resp);
  } else {
    send_json(req, 500, "{\"success\":false,\"error\":\"internal\"}", NULL);
  }

  free(e_title);
  free(e_lang);
  free(e_code);
  free(e_created);
  user_info_free(&u);
}

static void route_request(struct evhttp_request *req, void *arg) {
  AppState *app = (AppState *)arg;

  // 路由分发：根据 HTTP 方法和路径调用具体处理函数

  enum evhttp_cmd_type method = evhttp_request_get_command(req);
  const char *uri = evhttp_request_get_uri(req);

  struct evhttp_uri *decoded = evhttp_uri_parse(uri);
  if (!decoded) {
    evhttp_send_error(req, 400, "bad uri");
    return;
  }

  const char *path = evhttp_uri_get_path(decoded);
  if (!path || !*path) {
    path = "/";
  }

  // 调试输出：打印收到的原始 URI 与解析出的 path，帮助定位路由匹配问题
  fprintf(stderr, "ROUTE DEBUG: method=%d uri='%s' path='%s'\n", (int)method, uri ? uri : "", path ? path : "");

  if (method == EVHTTP_REQ_OPTIONS) {
    send_json(req, 200, "{}", NULL);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET &&
      (strcmp(path, "/") == 0 || strcmp(path, URL_PREFIX) == 0 ||
       strcmp(path, URL_PREFIX "/") == 0)) {
    send_redirect(req, LEARN_PREFIX "/");
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET && strcmp(path, LEARN_PREFIX) == 0) {
    send_redirect(req, LEARN_PREFIX "/");
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET && strcmp(path, EDITOR_PREFIX) == 0) {
    send_redirect(req, EDITOR_PREFIX "/");
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET &&
      path_matches(path, "/api/me")) {
    handle_me(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET &&
      path_matches(path, "/api/list")) {
    handle_list(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET &&
      path_matches(path, "/api/snippet")) {
    handle_snippet(app, req, uri);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/register")) {
    handle_register(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/login")) {
    handle_login(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/logout")) {
    handle_logout(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/check")) {
    handle_check(req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/compile")) {
    handle_compile(req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/ai")) {
    handle_ai(req);
    evhttp_uri_free(decoded);
    return;
  }
  if (method == EVHTTP_REQ_GET &&
      path_matches(path, "/api/courses")) {
    handle_courses_list(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET &&
      path_matches(path, "/api/course")) {
    handle_course_get(app, req, uri);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/course/save")) {
    handle_course_save(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_POST &&
      path_matches(path, "/api/save")) {
    handle_save(app, req);
    evhttp_uri_free(decoded);
    return;
  }

  if (method == EVHTTP_REQ_GET) {
    serve_static(app, req, path);
    evhttp_uri_free(decoded);
    return;
  }

  send_json(req, 404, "{\"success\":false,\"error\":\"not found\"}", NULL);
  evhttp_uri_free(decoded);
}

int main(int argc, char **argv) {
  AppState app;
  memset(&app, 0, sizeof(app));
  int port = DEFAULT_PORT;

  const char *env_port = getenv("PORT");
  if (env_port && *env_port) {
    int parsed = parse_port(env_port);
    if (parsed < 0) {
      fprintf(stderr, "invalid PORT: %s\n", env_port);
      return 1;
    }
    port = parsed;
  }

  if (argc >= 2) {
    int parsed = parse_port(argv[1]);
    if (parsed < 0) {
      fprintf(stderr, "invalid port: %s\n", argv[1]);
      return 1;
    }
    port = parsed;
  }

  if (!getcwd(app.base_dir, sizeof(app.base_dir))) {
    fprintf(stderr, "getcwd failed\n");
    return 1;
  }

  /* 如果当前工作目录下没有静态目录（例如从 server/ 目录运行），
     尝试回退到父目录以寻找 `front/` 静态资源目录，避免 404 问题。 */
  {
    char candidate[MAX_PATH_LEN];
    if (build_path(candidate, sizeof(candidate), app.base_dir, STATIC_DIR) != 0 || access(candidate, R_OK) != 0) {
      /* 尝试父目录 */
      char parent[MAX_PATH_LEN];
      strncpy(parent, app.base_dir, sizeof(parent));
      parent[sizeof(parent)-1] = '\0';
      char *slash = strrchr(parent, '/');
      if (slash && slash != parent) {
        *slash = '\0';
        if (build_path(candidate, sizeof(candidate), parent, STATIC_DIR) == 0 && access(candidate, R_OK) == 0) {
          /* 使用父目录作为 base_dir */
          strncpy(app.base_dir, parent, sizeof(app.base_dir));
          app.base_dir[sizeof(app.base_dir)-1] = '\0';
        }
      }
    }
  }

  if (sqlite3_open(DB_PATH, &app.db) != SQLITE_OK) {
    fprintf(stderr, "open db failed: %s\n", sqlite3_errmsg(app.db));
    if (app.db) {
      sqlite3_close(app.db);
    }
    return 1;
  }

  if (init_db(app.db) != 0) {
    sqlite3_close(app.db);
    return 1;
  }

  app.base = event_base_new();
  if (!app.base) {
    fprintf(stderr, "event_base_new failed\n");
    sqlite3_close(app.db);
    return 1;
  }

  app.http = evhttp_new(app.base);
  if (!app.http) {
    fprintf(stderr, "evhttp_new failed\n");
    event_base_free(app.base);
    sqlite3_close(app.db);
    return 1;
  }

  evhttp_set_gencb(app.http, route_request, &app);

  if (evhttp_bind_socket(app.http, "0.0.0.0", port) != 0) {
    fprintf(stderr, "bind port %d failed\n", port);
    evhttp_free(app.http);
    event_base_free(app.base);
    sqlite3_close(app.db);
    return 1;
  }

  printf("running on %d\n", port);
  event_base_dispatch(app.base);

  evhttp_free(app.http);
  event_base_free(app.base);
  sqlite3_close(app.db);
  return 0;
}
