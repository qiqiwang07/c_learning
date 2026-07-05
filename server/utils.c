#define _XOPEN_SOURCE 700
#include "utils.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <ctype.h>
#include <stdbool.h>
#include <time.h>
#include <unistd.h>
#include <openssl/rand.h>

// 复制字符串的简单封装，返回动态分配的拷贝。调用者需使用 free 释放返回值。
char *xstrdup(const char *s) {
  if (!s) return NULL;
  size_t n = strlen(s);
  char *out = malloc(n + 1);
  if (!out) return NULL;
  memcpy(out, s, n + 1);
  return out;
}

// 从指定长度创建以 '\0' 结尾的新字符串（类似 POSIX 的 strndup）。
// 注意：不会对源字符串进行越界检查，调用者需保证 n 合理。
char *strndup_local(const char *s, size_t n) {
  char *out = malloc(n + 1);
  if (!out) return NULL;
  memcpy(out, s, n);
  out[n] = '\0';
  return out;
}

// 释放 Str 结构中保存的缓冲区并重置字段。
void str_free(Str *s) {
  if (s && s->ptr) {
    free(s->ptr);
    s->ptr = NULL;
    s->len = 0;
  }
}

// 对输入字符串进行 JSON 字符串转义（返回 malloc 分配的字符串）。
// 例如将换行、双引号、反斜杠等转义为 \n, \" 等形式，便于直接嵌入 JSON。
char *json_escape(const char *in) {
  if (!in) return xstrdup("");
  size_t extra = 0;
  for (const unsigned char *p = (const unsigned char *)in; *p; ++p) {
    switch (*p) {
      case '"': case '\\': extra += 1; break;
      case '\b': case '\f': case '\n': case '\r': case '\t': extra += 1; break;
      default: if (*p < 0x20) extra += 5; break;
    }
  }
  size_t n = strlen(in);
  char *out = malloc(n + extra + 1);
  if (!out) return NULL;
  char *w = out;
  for (const unsigned char *p = (const unsigned char *)in; *p; ++p) {
    switch (*p) {
      case '"': *w++='\\'; *w++='"'; break;
      case '\\': *w++='\\'; *w++='\\'; break;
      case '\b': *w++='\\'; *w++='b'; break;
      case '\f': *w++='\\'; *w++='f'; break;
      case '\n': *w++='\\'; *w++='n'; break;
      case '\r': *w++='\\'; *w++='r'; break;
      case '\t': *w++='\\'; *w++='t'; break;
      default: if (*p < 0x20) { snprintf(w,7,"\\u%04x", *p); w+=6; } else *w++=(char)*p; break;
    }
  }
  *w='\0';
  return out;
}

// 从一个简单的 JSON 文本中提取指定键的字符串值（非严格 JSON 解析器）。
// 返回 malloc 分配的字符串，找不到返回 NULL。只支持双引号包裹的值。
char *json_get_string(const char *json, const char *key) {
  if (!json || !key) return NULL;
  size_t key_len = strlen(key);
  char pattern[256];
  if (key_len + 4 >= sizeof(pattern)) return NULL;
  snprintf(pattern, sizeof(pattern), "\"%s\"", key);
  const char *p = json;
  while ((p = strstr(p, pattern)) != NULL) {
    p += strlen(pattern);
    while (*p && isspace((unsigned char)*p)) ++p;
    if (*p != ':') {
      continue;
    }
    ++p; 
    while (*p && isspace((unsigned char)*p)) ++p;
    if (*p != '"') {
      continue;
    }
    ++p;
    char *out = malloc(strlen(p)+1);
    if (!out) return NULL;
    size_t w = 0; bool esc=false;
    while (*p) {
      char c = *p++;
      if (esc) { switch(c){ case 'n': out[w++]='\n'; break; case 'r': out[w++]='\r'; break; case 't': out[w++]='\t'; break; case '\\': out[w++]='\\'; break; case '"': out[w++]='"'; break; case 'b': out[w++]='\b'; break; case 'f': out[w++]='\f'; break; case 'u': if (strlen(p)>=4) p+=4; out[w++]='?'; break; default: out[w++]=c; break;} esc=false; continue; }
      if (c=='\\') { esc=true; continue; }
      if (c=='"') { out[w]='\0'; return out; }
      out[w++]=c;
    }
    free(out); return NULL;
  }
  return NULL;
}

// 将当前时间格式化为 ISO8601 UTC 字符串，写入 buf（含终止符）。
void iso8601_utc_now(char *buf, size_t size) {
  time_t t = time(NULL);
  struct tm tmv; gmtime_r(&t, &tmv);
  strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", &tmv);
}

// 将指定 time_t 转为 ISO8601 UTC 格式字符串。
void iso8601_utc_from_time(time_t t, char *buf, size_t size) {
  struct tm tmv; gmtime_r(&t, &tmv); strftime(buf, size, "%Y-%m-%dT%H:%M:%SZ", &tmv);
}

// 解析 ISO8601 格式的 UTC 时间字符串，返回 time_t。解析失败返回 (time_t)-1。
time_t parse_iso8601_utc(const char *s) {
  struct tm tmv; memset(&tmv,0,sizeof(tmv));
  if (!strptime(s, "%Y-%m-%dT%H:%M:%SZ", &tmv)) return (time_t)-1;
  char *old_tz = getenv("TZ"); setenv("TZ","UTC",1); tzset(); time_t t = mktime(&tmv);
  if (old_tz) setenv("TZ", old_tz, 1); else unsetenv("TZ"); tzset(); return t;
}

// 将目录和文件名安全拼接到 dst（格式为 "%s/%s"），若超长返回 -1。
int build_path(char *dst, size_t dst_size, const char *dir, const char *name) {
  int written = snprintf(dst, dst_size, "%s/%s", dir, name);
  if (written < 0 || (size_t)written >= dst_size) {
    return -1;
  }
  return 0;
}

// 简单的路径拼接，返回 malloc 分配的字符串（调用者需 free）。
// 如果 a 末尾没有 '/' 会自动插入。
char *path_join(const char *a, const char *b) {
  size_t n = strlen(a); size_t m = strlen(b); bool need_slash = n>0 && a[n-1] != '/';
  char *out = malloc(n + m + (need_slash?2:1)); if (!out) return NULL; strcpy(out,a); if (need_slash) strcat(out,"/"); strcat(out,b); return out;
}

// 在 /tmp 下创建临时目录，模板为 /tmp/c_learning_XXXXXX，成功返回 0 并将路径写入 buf。
int make_temp_dir(char *buf, size_t size) {
  snprintf(buf, size, "/tmp/c_learning_XXXXXX"); return mkdtemp(buf) ? 0 : -1;
}

// 简单地使用系统命令删除目录树（仅限开发环境，生产请勿直接使用 system("rm -rf")）。
void remove_tree_simple(const char *dir) { char cmd[1024]; snprintf(cmd, sizeof(cmd), "rm -rf '%s'", dir); system(cmd); }

int is_safe_rel_path(const char *p) { if (!p || !*p) return 0; if (strstr(p, "..")) return 0; if (*p=='/') return 0; return 1; }

// 使用 OpenSSL 生成安全随机字节，写入 buf，成功返回 0。
int random_bytes(unsigned char *buf, size_t n) {
  if (!buf) return -1;
  if (RAND_bytes(buf, (int)n) != 1) return -1;
  return 0;
}
