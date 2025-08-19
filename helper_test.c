#include <stdio.h>

// Assembly로 구현된 함수들
int funcA(void);
int funcB(void);

// Forward declaration
int normalB(void);

// 일반적인 호출 패턴
int normalA(void) {
    return normalB();
}

int normalB(void) {
    return 42;
}

int main(void) {
    printf("=== Helper Function Test ===\n");
    
    // 일반 호출: main -> normalA -> normalB
    printf("\n1. Normal call chain:\n");
    int result1 = normalA();
    printf("   Result: %d\n", result1);
    
    // 헬퍼 경유: main -> funcA -> helper -> funcB
    printf("\n2. Helper-mediated call chain:\n");
    int result2 = funcA();
    printf("   Result: %d\n", result2);
    
    return 0;
}