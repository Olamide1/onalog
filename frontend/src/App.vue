<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  // Initialize auth state on app load
  authStore.initAuth();
});
</script>

<style scoped>
#app {
  min-height: 100vh;
  background: var(--neutral-1);
}
</style>

