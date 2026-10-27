<!-- IGNIS's home page: the shared home layout with IGNIS's words. -->
<script setup lang="ts">
import { HOME } from './home-content';
import HomeLayout from './shared/HomeLayout.vue';
</script>

<template>
  <HomeLayout :content="HOME" />
</template>
