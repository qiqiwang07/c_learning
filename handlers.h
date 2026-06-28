#ifndef HANDLERS_H
#define HANDLERS_H

#include <event2/http.h>
#include <sqlite3.h>
#include "app.h"

void register_handlers(struct AppState *app, struct evhttp *http);

#endif // HANDLERS_H
