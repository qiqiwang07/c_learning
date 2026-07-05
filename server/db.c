#include "db.h"
#include "utils.h"
#include <sqlite3.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// db.c: 包含数据库初始化与与会话/用户相关的辅助函数
// 负责创建表、生成/验证密码哈希、会话管理等。
#include <ctype.h>
#include <time.h>
#include <openssl/evp.h>
#include <openssl/crypto.h>
#include <openssl/rand.h>

// 初始化数据库表：users, sessions, snippets
// 返回 0 表示成功，非 0 表示失败。
int init_db(sqlite3 *db) {
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

  char *err = NULL;
  if (sqlite3_exec(db, sql_users, NULL, NULL, &err) != SQLITE_OK) {
    sqlite3_free(err);
    return -1;
  }
  if (sqlite3_exec(db, sql_sessions, NULL, NULL, &err) != SQLITE_OK) {
    sqlite3_free(err);
    return -1;
  }
  if (sqlite3_exec(db, sql_snippets, NULL, NULL, &err) != SQLITE_OK) {
    sqlite3_free(err);
    return -1;
  }
  return 0;
}

// 将原始字节编码为十六进制字符串（malloc 返回，调用者需 free）。
static char *hex_encode(const unsigned char *src, size_t n) {
  static const char *hex = "0123456789abcdef";
  char *out = (char *)malloc(n * 2 + 1);
  if (!out) return NULL;
  for (size_t i = 0; i < n; ++i) { out[2*i] = hex[(src[i]>>4)&0x0F]; out[2*i+1] = hex[src[i]&0x0F]; }
  out[n*2] = '\0'; return out;
}

// 将十六进制字符串解码为原始字节，out_len 指定输出长度。
static int hex_decode(const char *hexs, unsigned char *out, size_t out_len) {
  size_t n = strlen(hexs);
  if (n != out_len*2) return -1;
  for (size_t i=0;i<out_len;++i) {
    char a = hexs[2*i]; char b = hexs[2*i+1]; int hi = isdigit((unsigned char)a)?a-'0':(tolower((unsigned char)a)-'a'+10); int lo = isdigit((unsigned char)b)?b-'0':(tolower((unsigned char)b)-'a'+10); if (hi<0||hi>15||lo<0||lo>15) return -1; out[i] = (unsigned char)((hi<<4)|lo);
  }
  return 0;
}

// 依赖 utils 中的 random_bytes 和 xstrdup
extern int random_bytes(unsigned char *buf, size_t n);
extern char *xstrdup(const char *s);

// 使用 PBKDF2-HMAC-SHA256 生成带 salt 的密码哈希，格式为 salthex:digesthex
// 返回 malloc 分配的字符串，失败返回 NULL。
char *hash_password(const char *password) {
  unsigned char salt[16]; unsigned char digest[32];
  if (random_bytes(salt, sizeof(salt)) != 0) return NULL;
  if (PKCS5_PBKDF2_HMAC(password, (int)strlen(password), salt, (int)sizeof(salt), 100000, EVP_sha256(), (int)sizeof(digest), digest) != 1) return NULL;
  char *salt_hex = hex_encode(salt, sizeof(salt)); char *dig_hex = hex_encode(digest, sizeof(digest)); if (!salt_hex||!dig_hex){free(salt_hex); free(dig_hex); return NULL;} size_t need = strlen(salt_hex)+1+strlen(dig_hex)+1; char *out=malloc(need); if (!out){free(salt_hex); free(dig_hex); return NULL;} snprintf(out,need,"%s:%s", salt_hex, dig_hex); free(salt_hex); free(dig_hex); return out;
}

// 验证给定密码是否匹配存储的 salt:hash 字符串，返回 1 为匹配，0 为不匹配。
int verify_password(const char *password, const char *stored) {
  const char *sep = strchr(stored, ':'); if (!sep) return 0; size_t salt_hex_len = (size_t)(sep-stored); char *salt_hex = strndup_local(stored, salt_hex_len); const char *dig_hex = sep+1; if (!salt_hex || strlen(salt_hex)!=32 || strlen(dig_hex)!=64) { free(salt_hex); return 0; } unsigned char salt[16]; unsigned char expected[32]; unsigned char actual[32]; if (hex_decode(salt_hex, salt, sizeof(salt))!=0 || hex_decode(dig_hex, expected, sizeof(expected))!=0) { free(salt_hex); return 0; } free(salt_hex); if (PKCS5_PBKDF2_HMAC(password, (int)strlen(password), salt, (int)sizeof(salt), 100000, EVP_sha256(), (int)sizeof(actual), actual) != 1) return 0; return CRYPTO_memcmp(actual, expected, sizeof(actual))==0;
}

// 为指定用户创建一个会话记录，sid_out 返回新会话 ID（十六进制字符串，需 free）。
// 返回 0 成功，非 0 失败。
int create_session(sqlite3 *db, long user_id, char **sid_out) {
  unsigned char raw[32]; if (random_bytes(raw, sizeof(raw))!=0) return -1; char *sid = hex_encode(raw, sizeof(raw)); if (!sid) return -1; time_t exp_t = time(NULL) + 24*3600; char exp[32]; iso8601_utc_from_time(exp_t, exp, sizeof(exp)); sqlite3_stmt *stmt=NULL; const char *sql="INSERT INTO sessions(id, user_id, expires_at) VALUES(?,?,?)"; if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL)!=SQLITE_OK){ free(sid); return -1;} sqlite3_bind_text(stmt,1,sid,-1,SQLITE_TRANSIENT); sqlite3_bind_int64(stmt,2,user_id); sqlite3_bind_text(stmt,3,exp,-1,SQLITE_TRANSIENT); int rc=sqlite3_step(stmt); sqlite3_finalize(stmt); if (rc!=SQLITE_DONE){ free(sid); return -1;} *sid_out=sid; return 0;
}

// 删除指定会话 ID 的记录。
void delete_session(sqlite3 *db, const char *sid) { if (!sid||!*sid) return; sqlite3_stmt *stmt=NULL; const char *sql="DELETE FROM sessions WHERE id = ?"; if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL)==SQLITE_OK){ sqlite3_bind_text(stmt,1,sid,-1,SQLITE_TRANSIENT); sqlite3_step(stmt); sqlite3_finalize(stmt);} }

// 根据会话 ID 查找对应的用户（并检查过期时间）。
// 如果会话有效，返回包含用户 id 和用户名的 UserInfo（ok=1）；否则返回 ok=0。
// 如果会话过期会自动删除会话记录。
UserInfo get_user_by_session(sqlite3 *db, const char *sid) {
  UserInfo u={0,NULL,0}; if (!sid||!*sid) return u; sqlite3_stmt *stmt=NULL; const char *sql = "SELECT users.id, users.username, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?"; if (sqlite3_prepare_v2(db, sql, -1, &stmt, NULL)!=SQLITE_OK) return u; sqlite3_bind_text(stmt,1,sid,-1,SQLITE_TRANSIENT); if (sqlite3_step(stmt)==SQLITE_ROW){ long uid = (long)sqlite3_column_int64(stmt,0); const char *uname=(const char*)sqlite3_column_text(stmt,1); const char *exp=(const char*)sqlite3_column_text(stmt,2); if (uname && exp){ time_t exp_t = parse_iso8601_utc(exp); if (exp_t > time(NULL)){ u.id=uid; u.username = xstrdup(uname); u.ok = u.username!=NULL; } } } sqlite3_finalize(stmt); if (!u.ok) delete_session(db,sid); return u; }

// 释放 UserInfo 中分配的内存并重置状态。
void user_info_free(UserInfo *u) { if (u && u->username) { free(u->username); u->username=NULL; u->ok=0; } }
