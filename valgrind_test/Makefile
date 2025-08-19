CC = gcc
AS = as
CFLAGS = -O0 -g -fno-inline -fno-omit-frame-pointer -Wall
ASFLAGS = -g
LDFLAGS = -g -static

TARGET = callgrind_test
OBJS = main.o user.o user_asm.o

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $^

main.o: main.c
	$(CC) $(CFLAGS) -c -o $@ $<

user.o: user.c
	$(CC) $(CFLAGS) -c -o $@ $<

user_asm.o: user.S
	$(AS) $(ASFLAGS) -o $@ $<

clean:
	rm -f $(OBJS) $(TARGET) callgrind.out.*

run: $(TARGET)
	./$(TARGET)

callgrind: $(TARGET)
	valgrind --tool=callgrind --collect-jumps=yes --branch-sim=yes --dump-instr=yes --collect-systime=yes ./$(TARGET)

annotate: callgrind
	callgrind_annotate --auto=yes --show-percs=yes callgrind.out.*

.PHONY: all clean run callgrind annotate