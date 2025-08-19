#include <stdio.h>

int example_function(int x) {
    // Basic Block 1 시작
    int result = 0;
    int temp = x * 2;
    // Basic Block 1 끝 (조건 분기)
    
    if (temp > 10) {  // 분기점
        // Basic Block 2 시작
        result = temp + 5;
        printf("Large: %d\n", result);
        // Basic Block 2 끝
    } else {
        // Basic Block 3 시작
        result = temp - 3;
        printf("Small: %d\n", result);
        // Basic Block 3 끝
    }
    
    // Basic Block 4 시작
    result *= 2;
    return result;
    // Basic Block 4 끝
}