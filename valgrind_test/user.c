void main_func1(void);
void main_func2(void);
void main_func3(void);
void main_func4(void);
void asm_func1(void);
void asm_func2(void);
void asm_func3(void);
void asm_func4(void);
void user_func1(void);
void user_func2(void);
void user_func3(void);
void user_func4(void);

extern int global_counter;
extern int recursion_depth;

void user_func1(void) {
    if (recursion_depth > 8) return;
    
    recursion_depth++;
    global_counter += 2;
    
    if (global_counter < 20 && recursion_depth < 5) {
        if (global_counter % 3 == 0) {
            asm_func3();
        }
    }
    
    recursion_depth--;
}

void user_func2(void) {
    if (recursion_depth > 8) return;
    
    recursion_depth++;
    global_counter++;
    
    if (global_counter < 15 && recursion_depth < 5) {
        asm_func4();
    }
    
    recursion_depth--;
}

void user_func3(void) {
    if (recursion_depth > 8) return;
    
    recursion_depth++;
    global_counter--;
    
    if (global_counter > 5 && global_counter < 25 && recursion_depth < 5) {
        main_func4();
    }
    
    recursion_depth--;
}

void user_func4(void) {
    if (recursion_depth > 8) return;
    
    recursion_depth++;
    global_counter += 3;
    
    if (global_counter < 30 && recursion_depth < 5) {
        if (global_counter % 2 == 0) {
            main_func2();
        }
    }
    
    recursion_depth--;
}