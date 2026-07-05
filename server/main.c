// main.c: 应用程序入口，初始化 libevent、打开数据库并注册 HTTP 路由。
#include <event2/event.h>
#include <event2/http.h>
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <sqlite3.h>
#include "handlers.h"
#include "db.h"

// 程序入口：可选的第一个参数为端口号。启动后进入事件循环，接收 HTTP 请求。
int main(int argc, char **argv) {
  int port = 7000; if (argc>1) port = atoi(argv[1]);
  // 忽略 SIGPIPE，避免写到已关闭的 socket 导致进程退出
  signal(SIGPIPE, SIG_IGN);
  struct event_base *base = event_base_new(); struct evhttp *http = evhttp_new(base);
  // 简化的 AppState 在 handlers.c 中定义（包含 db/webroot）
  struct AppState *app = calloc(1,sizeof(*app)); sqlite3 *db=NULL; sqlite3_open("code_store.db", &db); app->db=db; // 使用当前工作目录作为 base_dir
  if (!getcwd(app->base_dir, sizeof(app->base_dir))) { fprintf(stderr, "getcwd failed\n"); return 1; }
  init_db(db);
  register_handlers(app, http);
  if (evhttp_bind_socket(http, "0.0.0.0", port)!=0){ fprintf(stderr,"bind failed\n"); return 1; }
  printf("running on %d\n", port);
  event_base_dispatch(base);
  evhttp_free(http); event_base_free(base); sqlite3_close(db); free(app);
  return 0;
}
