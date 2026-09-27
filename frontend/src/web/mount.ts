import { createApp } from 'vue';
import { FrappeUI } from 'frappe-ui';
import { outsideClickDirective } from 'src/utils/outsideClick';
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
app.directive('on-outside-click', outsideClickDirective);
app.mixin({
  computed: {
    fyo() {
      return fyo;
    },
  },
  methods: { t: fyo.t, T: fyo.T },
});
app.mount('#app');
