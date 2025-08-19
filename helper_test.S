.text
.global funcA
.global funcB
.global __my_restore_and_jump

# 함수 A: 헬퍼를 통해 B로 이동
funcA:
    push    %rbp
    mov     %rsp, %rbp
    push    %rbx
    push    %r12
    push    %r13

    # 작업 수행
    mov     $100, %eax
    add     $50, %eax

    # 헬퍼 함수 호출
    call    __my_restore_and_jump

    # 헬퍼에서 복귀 후 정리
    pop     %r13
    pop     %r12
    pop     %rbx
    pop     %rbp
    ret

  __my_restore_and_jump:
    push    %rbp
    mov     %rsp, %rbp

    # 레지스터 복원 작업 시뮬레이션
    # (실제로는 컴파일러가 생성하는 복잡한 작업)

    # funcB 호출
    call    funcB

    # funcB의 반환값은 %eax에 있음

    pop     %rbp
    ret

funcB:
    push    %rbp
    mov     %rsp, %rbp

    # 반환값 설정
    mov     $42, %eax

    pop     %rbp
    ret

.section .note.GNU-stack,"",@progbits
