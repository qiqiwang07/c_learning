#ifndef DB_H
#define DB_H

#include <sqlite3.h>
#include "utils.h"

int init_db(sqlite3 *db);
int create_session(sqlite3 *db, long user_id, char **sid_out);
void delete_session(sqlite3 *db, const char *sid);

typedef struct {
  long id;
  char *username;
  int ok;
} UserInfo;

UserInfo get_user_by_session(sqlite3 *db, const char *sid);
void user_info_free(UserInfo *u);
char *hash_password(const char *password);
int verify_password(const char *password, const char *stored);

#endif // DB_H
