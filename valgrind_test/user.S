.text
.global asm_func1
.global asm_func2
.global asm_func3
.global asm_func4

.extern main_func1
.extern main_func2
.extern main_func3
.extern main_func4
.extern user_func1
.extern user_func2
.extern user_func3
.extern user_func4
.extern global_counter
.extern recursion_depth

.align 16
asm_func1:
    push    %rbp
    mov     %rsp, %rbp
    
    mov     recursion_depth(%rip), %eax
    cmp     $8, %eax
    jg      .L1_exit
    inc     %eax
    mov     %eax, recursion_depth(%rip)
    
    mov     global_counter(%rip), %ecx
    add     $3, %ecx
    mov     %ecx, global_counter(%rip)
    
    cmp     $20, %ecx
    jg      .L1_skip
    call    user_func2
    
.L1_skip:
    mov     recursion_depth(%rip), %eax
    dec     %eax
    mov     %eax, recursion_depth(%rip)
    
.L1_exit:
    pop     %rbp
    ret

.align 16
asm_func2:
    push    %rbp
    mov     %rsp, %rbp
    
    mov     global_counter(%rip), %eax
    inc     %eax
    mov     %eax, global_counter(%rip)
    
    cmp     $15, %eax
    je      .L2_fallthrough
    
    cmp     $10, %eax
    jl      .L2_normal
    
    pop     %rbp
    ret
    
.L2_normal:
    call    main_func3
    pop     %rbp
    ret
    
.L2_fallthrough:
    pop     %rbp

.L2_after_fall:
    mov     global_counter(%rip), %eax
    xor     $0x0F, %eax
    mov     %eax, global_counter(%rip)
    ret

.align 16
asm_func3:
    push    %rbp
    mov     %rsp, %rbp
    
    mov     recursion_depth(%rip), %eax
    cmp     $8, %eax
    jg      .L3_exit
    inc     %eax
    mov     %eax, recursion_depth(%rip)
    
    mov     global_counter(%rip), %ecx
    sub     $2, %ecx
    mov     %ecx, global_counter(%rip)
    
    cmp     $5, %ecx
    jl      .L3_small
    cmp     $15, %ecx
    jl      .L3_medium
    
    call    main_func4
    jmp     .L3_done
    
.L3_small:
    cmp     $0, %ecx
    jle     .L3_done
    call    user_func4
    jmp     .L3_done
    
.L3_medium:
    call    main_func2
    
.L3_done:
    mov     recursion_depth(%rip), %eax
    dec     %eax
    mov     %eax, recursion_depth(%rip)
    
.L3_exit:
    pop     %rbp
    ret

.align 16
asm_func4:
    push    %rbp
    mov     %rsp, %rbp
    
    mov     global_counter(%rip), %eax
    add     $4, %eax
    mov     %eax, global_counter(%rip)
    
    cmp     $19, %eax
    je      .L4_fallthrough
    
    cmp     $25, %eax
    jg      .L4_large
    
    call    user_func2
    jmp     .L4_exit
    
.L4_large:
    call    main_func1
    
.L4_exit:
    pop     %rbp
    ret
    
.L4_fallthrough:
    pop     %rbp

.L4_hidden:
    push    %rax
    mov     global_counter(%rip), %eax
    and     $0x07, %eax
    add     $10, %eax
    mov     %eax, global_counter(%rip)
    pop     %rax
    ret

.global chain_func1
.align 16
chain_func1:
    mov     global_counter(%rip), %eax
    add     $5, %eax
    mov     %eax, global_counter(%rip)

chain_func2:
    mov     global_counter(%rip), %eax
    shl     $1, %eax
    mov     %eax, global_counter(%rip)

chain_func3:
    mov     global_counter(%rip), %eax
    and     $0xFF, %eax
    mov     %eax, global_counter(%rip)
    ret

.section .note.GNU-stack,"",@progbits
