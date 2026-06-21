import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';
import { queryClient } from './queryClient';
import router from './router';
import './style.css';

createApp(App)
    .use(createPinia())
    .use(VueQueryPlugin, { queryClient })
    .use(router)
    .use(PrimeVue, {
        unstyled: true,
    })
    .mount('#app');
