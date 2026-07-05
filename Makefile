CC = gcc
SRCS = server/server.c
OBJS = $(SRCS:.c=.o)

CFLAGS = -O2 -Wall -Wextra -std=c11
LIBS = -levent -lsqlite3 -lssl -lcrypto
TARGET = server/server

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) $(OBJS) -o $(TARGET) $(LIBS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET) $(OBJS)

.PHONY: all run clean
