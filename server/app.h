#ifndef APP_H
#define APP_H

#include <sqlite3.h>
#include <event2/http.h>
#include <event2/event.h>

// 基本路径长度常量，供 AppState 使用
#ifndef MAX_PATH_LEN
#define MAX_PATH_LEN 1024
#endif

// 应用级共享状态，包含 DB 连接、HTTP 句柄、事件循环和基目录
struct AppState {
  sqlite3 *db;
  struct evhttp *http;
  struct event_base *base;
  char base_dir[MAX_PATH_LEN];
};

// 方便以 `AppState` 作为类型名使用
typedef struct AppState AppState;

#endif // APP_H
