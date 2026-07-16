import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import VueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss(), VueDevTools()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    // Narrow scope: vitest covers the pure save-path logic only — pendingChanges.ts's
    // coalescing rules (T-24) and useSpacesStore's flush orchestration (T-34.7/11/12,
    // which mock the API boundary rather than mount anything). No jsdom, no component
    // tests. Those two files are where a silent data-loss bug hides and where a manual
    // drive cannot reach; everything else is still verified by driving the app.
    test: {
        include: ['src/**/*.test.ts'],
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
