#include <stdio.h>

void user_func1(void);
void user_func2(void);
void user_func3(void);
void user_func4(void);
void asm_func1(void);
void asm_func2(void);
void asm_func3(void);
void asm_func4(void);
void main_func1(void);
void main_func2(void);
void main_func3(void);
void main_func4(void);
void chain_func1(void);

int global_counter = 0;
int recursion_depth = 0;
const int MAX_DEPTH = 10;

void main_func1(void) {
    if (recursion_depth++ > MAX_DEPTH) {
        recursion_depth--;
        return;
    }
    
    global_counter++;
    
    if (global_counter < 5 && recursion_depth < 5) {
        user_func1();
    }
    
    recursion_depth--;
}

void main_func2(void) {
    if (recursion_depth++ > MAX_DEPTH) {
        recursion_depth--;
        return;
    }
    
    global_counter += 2;
    
    if (global_counter % 4 == 0 && recursion_depth < 5) {
        asm_func2();
    }
    
    recursion_depth--;
}

void main_func3(void) {
    if (recursion_depth++ > MAX_DEPTH) {
        recursion_depth--;
        return;
    }
    
    global_counter++;
    
    if (global_counter < 10 && recursion_depth < 5) {
        user_func4();
    }
    
    recursion_depth--;
}

void main_func4(void) {
    if (recursion_depth++ > MAX_DEPTH) {
        recursion_depth--;
        return;
    }
    
    global_counter += 3;
    
    if (global_counter % 3 == 0 && recursion_depth < 5) {
        asm_func1();
    }
    
    recursion_depth--;
}

int main(void) {
    printf("Starting callgrind test program\n");
    
    global_counter = 0;
    recursion_depth = 0;
    main_func1();
    printf("After main_func1: counter = %d\n", global_counter);
    
    global_counter = 14;
    recursion_depth = 0;
    asm_func2();
    printf("After asm_func2: counter = %d\n", global_counter);
    
    global_counter = 10;
    chain_func1();
    printf("After chain_func1: counter = %d\n", global_counter);
    
    global_counter = 15;
    recursion_depth = 0;
    asm_func4();
    printf("After asm_func4: counter = %d\n", global_counter);
    
    return 0;
}