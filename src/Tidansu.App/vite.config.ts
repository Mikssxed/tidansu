import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import VueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss(), VueDevTools()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        outDir: '../Tidansu.API/wwwroot',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // Split heavy vendor libraries into separate, independently-cacheable chunks
                manualChunks(id) {
                    if (!id.includes('node_modules')) return;
                    if (id.includes('@microsoft/kiota')) return 'kiota';
                    if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/.test(id))
                        return 'vue-vendor';
                    if (id.includes('@tanstack')) return 'query';
                    if (id.includes('primevue') || id.includes('@primeuix')) return 'primevue';
                    if (id.includes('vee-validate') || id.includes('zod')) return 'forms';
                    return 'vendor';
                },
            },
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:5081/',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
