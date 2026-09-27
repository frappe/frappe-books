<script>
import { h } from 'vue';
import AttachImage from './AttachImage.vue';
import Attachment from './Attachment.vue';
import AutoComplete from './AutoComplete.vue';
import Check from './Check.vue';
import Button from './Button.vue';
import Color from './Color.vue';
import Currency from './Currency.vue';
import Data from './Data.vue';
import Date from './Date.vue';
import Datetime from './Datetime.vue';
import DynamicLink from './DynamicLink.vue';
import Float from './Float.vue';
import Int from './Int.vue';
import Link from './Link.vue';
import Select from './Select.vue';
import Text from './Text.vue';

const components = {
  AttachImage,
  Data,
  Check,
  Button,
  Color,
  Select,
  Link,
  Date,
  Datetime,
  AutoComplete,
  DynamicLink,
  Int,
  Float,
  Attachment,
  Currency,
  Text,
};

export default {
  name: 'FormControl',
  inheritAttrs: false,
  methods: {
    clear() {
      const input = this.$refs.control.getInputElement?.();
      if (input instanceof HTMLInputElement) {
        input.value = '';
      }
    },
    select() {
      this.$refs.control.getInputElement?.()?.select?.();
    },
    focus() {
      this.$refs.control.focus();
    },
    getInput() {
      return this.$refs.control.getInputElement?.();
    },
  },
  render() {
    const fieldtype = this.$attrs.df.fieldtype;
    const component = components[fieldtype] ?? Data;

    return h(component, {
      ...(fieldtype === 'Check' ? { layout: 'field' } : {}),
      ...this.$attrs,
      ref: 'control',
    });
  },
};
</script>
