import { readonly, ref } from 'vue';

export function useModal() {
    const isOpen = ref(false);

    const open = () => {
        isOpen.value = true;
    };
    const close = () => {
        isOpen.value = false;
    };

    return { isOpen: readonly(isOpen), open, close };
}
