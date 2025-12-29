<template>
  <button class="credit-pill" @click="$emit('open-buy')">
    Credits: <strong>{{ balance ?? '—' }}</strong>
  </button>
</template>

<script setup>
defineProps({
  balance: {
    type: Number,
    default: null
  }
});
defineEmits(['open-buy']);
</script>

<style scoped>
.credit-pill {
  border: var(--border-medium) solid var(--neutral-2);
  background: var(--neutral-1);
  color: var(--neutral-2);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 18px;
  font-weight: var(--font-weight-semibold);
}
.credit-pill:hover {
  background: var(--neutral-2);
  color: var(--neutral-1);
}
</style>


