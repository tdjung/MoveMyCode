#include "utils.h"
#include <stdio.h>

static int hardware_state = 0;

int init_hardware(void) {
    printf("Initializing hardware components...\n");
    hardware_state = 1;
    
    // Critical initialization code
    if (setup_memory() != 0) {
        return -1;
    }
    
    if (setup_interrupts() != 0) {
        cleanup_memory();
        return -2;
    }
    
    printf("Hardware initialization complete\n");
    return 0;
}

void process_cycle(int cycle) {
    // This function is called every cycle
    hardware_state = (hardware_state + 1) % 1000;
    
    // Some conditional logic
    if (cycle > 500) {
        advanced_processing();
    }
}

int check_error_condition(void) {
    // This is rarely true in normal operation
    return (hardware_state > 950) ? 1 : 0;
}

void handle_error(void) {
    printf("Error condition detected!\n");
    hardware_state = 0;
}

void cleanup_hardware(void) {
    printf("Cleaning up hardware resources...\n");
    hardware_state = 0;
}