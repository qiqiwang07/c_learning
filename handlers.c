#include "handlers.h"
#include "utils.h"
#include "db.h"
#include "exec.h"
#include <event2/http.h>
#include <event2/buffer.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

// AppState 在此文件仅需持有数据库指针与静态文件根目录
// 使用公共的 AppState 定义（app.h）
#include "app.h"

// 发送 JSON 响应的简易封装（不会设置额外头），json 字符串由调用者负责分配/释放。
static void send_json(struct evhttp_request *req, int code, const char *json) {
  struct evbuffer *buf = evbuffer_new(); evbuffer_add_printf(buf, "%s", json); evhttp_send_reply(req, code, "OK", buf); evbuffer_free(buf);
}

// 处理 /register 请求：解析 body 中 username/password 并插入 users 表。
// 注意：这里为示例实现，缺少更严格的输入校验与并发冲突处理。
static void handle_register(struct evhttp_request *req, void *arg) {
  struct AppState *app = arg; struct evbuffer *in = evhttp_request_get_input_buffer(req); size_t len = evbuffer_get_length(in); char *data = malloc(len+1); evbuffer_remove(in, data, len); data[len]='\0'; char *username = json_get_string(data, "username"); char *password = json_get_string(data, "password"); free(data); if (!username||!password){ send_json(req,400,"{\"ok\":false,\"error\":\"missing\"}"); free(username); free(password); return; } sqlite3_stmt *stmt=NULL; const char *sql="INSERT INTO users(username,password_hash,created_at) VALUES(?,?,?)"; char now[64]; iso8601_utc_now(now,sizeof(now)); char *hash = hash_password(password); if (!hash){ send_json(req,500,"{\"ok\":false}\""); free(username); free(password); return;} if (sqlite3_prepare_v2(app->db, sql, -1, &stmt, NULL)==SQLITE_OK){ sqlite3_bind_text(stmt,1,username,-1,SQLITE_TRANSIENT); sqlite3_bind_text(stmt,2,hash,-1,SQLITE_TRANSIENT); sqlite3_bind_text(stmt,3,now,-1,SQLITE_TRANSIENT); if (sqlite3_step(stmt)!=SQLITE_DONE){ send_json(req,400,"{\"ok\":false,\"error\":\"exists\"}"); } else { send_json(req,200,"{\"ok\":true}"); } sqlite3_finalize(stmt); } else { send_json(req,500,"{\"ok\":false}"); } free(hash); free(username); free(password);
}

// 返回静态首页（简化实现，实际应使用更完整的静态文件服务）。
static void handle_index(struct evhttp_request *req, void *arg) {
  // app 在此函数当前未使用，但保留参数以便将来扩展
  (void)arg;
  const char *path = "web/index.html";
  FILE *f = fopen(path, "rb");
  if (!f) {
    evhttp_send_error(req, 404, "Not found");
    return;
  }
  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *buf = malloc(sz);
  fread(buf, 1, sz, f);
  fclose(f);
  struct evbuffer *out = evbuffer_new();
  evbuffer_add(out, buf, sz);
  evhttp_send_reply(req, 200, "OK", out);
  evbuffer_free(out);
  free(buf);
}

// 在外部初始化好的 evhttp 上注册本文件实现的路由（示例）。
void register_handlers(struct AppState *app, struct evhttp *http) {
  evhttp_set_cb(http, "/register", handle_register, app);
  evhttp_set_gencb(http, handle_index, app);
}
