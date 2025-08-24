#include <stdio.h>
#include <stdlib.h>
#include "utils.h"

int main(int argc, char* argv[]) {
    printf("Hardware Simulation Starting...\n");
    
    if (argc < 2) {
        printf("Usage: %s <config_file>\n", argv[0]);
        return -1;
    }
    
    // Initialize hardware components
    int result = init_hardware();
    if (result != 0) {
        printf("Hardware initialization failed\n");
        return result;
    }
    
    // Main simulation loop
    for (int cycle = 0; cycle < 1000; cycle++) {
        process_cycle(cycle);
        
        if (cycle % 100 == 0) {
            printf("Processed %d cycles\n", cycle);
        }
        
        // Error handling (rarely executed)
        if (check_error_condition()) {
            handle_error();
            break;
        }
    }
    
    cleanup_hardware();
    printf("Simulation completed successfully\n");
    return 0;
}