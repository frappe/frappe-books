import { createApp } from 'vue';
import { FrappeUI } from 'frappe-ui';
import { fyo } from 'src/initFyo';
import router from 'src/router';
import WebApp from './WebApp.vue';
import { showToast } from 'src/utils/interactive';

fyo.onDocumentActionWarning = ({ message }) => {
  showToast({ type: 'warning', message });
};

const app = createApp(WebApp);
app.use(FrappeUI);
app.use(router);
app.mixin({
  computed: {
    fyo() {
      return fyo;
    },
  },
  methods: { t: fyo.t, T: fyo.T },
});
app.mount('#app');
