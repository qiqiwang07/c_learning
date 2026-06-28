#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>
#include <time.h>

#define MAX_CMD_OUTPUT (256*1024)

typedef struct { char *ptr; size_t len; } Str;

char *xstrdup(const char *s);
char *strndup_local(const char *s, size_t n);
void str_free(Str *s);
char *json_escape(const char *in);
char *json_get_string(const char *json, const char *key);
void iso8601_utc_now(char *buf, size_t size);
void iso8601_utc_from_time(time_t t, char *buf, size_t size);
time_t parse_iso8601_utc(const char *s);
int build_path(char *dst, size_t dst_size, const char *dir, const char *name);
char *path_join(const char *a, const char *b);
int make_temp_dir(char *buf, size_t size);
void remove_tree_simple(const char *dir);
int is_safe_rel_path(const char *p);
int random_bytes(unsigned char *buf, size_t n);



#endif // UTILS_H
#ifndef UTILS_H
#define UTILS_H

#include <time.h>
#include <stddef.h>

typedef struct {
  char *ptr;
  size_t len;
} Str;

char *xstrdup(const char *s);
char *strndup_local(const char *s, size_t n);
void str_free(Str *s);
char *json_escape(const char *in);
char *json_get_string(const char *json, const char *key);
void iso8601_utc_now(char *buf, size_t size);
void iso8601_utc_from_time(time_t t, char *buf, size_t size);
time_t parse_iso8601_utc(const char *s);
int build_path(char *dst, size_t dst_size, const char *dir, const char *name);
char *path_join(const char *a, const char *b);
int make_temp_dir(char *buf, size_t size);
void remove_tree_simple(const char *dir);
int is_safe_rel_path(const char *p);

#endif // UTILS_H
