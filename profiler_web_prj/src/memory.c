#include "memory.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static memory_pool_t memory_pools[MAX_MEMORY_POOLS];
static int pool_count = 0;

int setup_memory(void) {
    printf("Setting up memory management...\n");
    
    // Initialize memory pools
    for (int i = 0; i < MAX_MEMORY_POOLS; i++) {
        memory_pools[i].base_addr = NULL;
        memory_pools[i].size = 0;
        memory_pools[i].allocated = 0;
        memory_pools[i].free_blocks = 0;
    }
    
    // Allocate main memory pool
    void* main_pool = malloc(MAIN_MEMORY_SIZE);
    if (!main_pool) {
        printf("Failed to allocate main memory pool\n");
        return -1;
    }
    
    memory_pools[0].base_addr = main_pool;
    memory_pools[0].size = MAIN_MEMORY_SIZE;
    memory_pools[0].free_blocks = 1;
    pool_count = 1;
    
    // Setup DMA memory if needed
    if (setup_dma_memory() != 0) {
        cleanup_memory();
        return -2;
    }
    
    printf("Memory setup completed successfully\n");
    return 0;
}

void* allocate_memory(size_t size) {
    if (size == 0) {
        return NULL;
    }
    
    // Find suitable memory pool
    for (int i = 0; i < pool_count; i++) {
        if (memory_pools[i].size - memory_pools[i].allocated >= size) {
            void* ptr = (char*)memory_pools[i].base_addr + memory_pools[i].allocated;
            memory_pools[i].allocated += size;
            memory_pools[i].free_blocks--;
            return ptr;
        }
    }
    
    // No suitable pool found
    printf("Memory allocation failed for size %zu\n", size);
    return NULL;
}

void free_memory(void* ptr) {
    if (ptr == NULL) {
        return;
    }
    
    // Find which pool this pointer belongs to
    for (int i = 0; i < pool_count; i++) {
        char* pool_start = (char*)memory_pools[i].base_addr;
        char* pool_end = pool_start + memory_pools[i].size;
        
        if ((char*)ptr >= pool_start && (char*)ptr < pool_end) {
            memory_pools[i].free_blocks++;
            // Simple implementation - just mark as freed
            return;
        }
    }
    
    printf("Warning: Attempted to free invalid pointer\n");
}

int setup_dma_memory(void) {
    if (pool_count >= MAX_MEMORY_POOLS) {
        return -1;
    }
    
    void* dma_pool = malloc(DMA_MEMORY_SIZE);
    if (!dma_pool) {
        return -2;
    }
    
    memory_pools[pool_count].base_addr = dma_pool;
    memory_pools[pool_count].size = DMA_MEMORY_SIZE;
    memory_pools[pool_count].free_blocks = 1;
    pool_count++;
    
    return 0;
}

void cleanup_memory(void) {
    printf("Cleaning up memory pools...\n");
    
    for (int i = 0; i < pool_count; i++) {
        if (memory_pools[i].base_addr) {
            free(memory_pools[i].base_addr);
            memory_pools[i].base_addr = NULL;
            memory_pools[i].size = 0;
            memory_pools[i].allocated = 0;
        }
    }
    
    pool_count = 0;
    printf("Memory cleanup completed\n");
}

void print_memory_stats(void) {
    printf("Memory Pool Statistics:\n");
    
    for (int i = 0; i < pool_count; i++) {
        printf("Pool %d: Size=%zu, Allocated=%zu, Free Blocks=%d\n", 
               i, memory_pools[i].size, memory_pools[i].allocated, 
               memory_pools[i].free_blocks);
    }
}