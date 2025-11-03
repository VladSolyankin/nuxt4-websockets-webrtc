<template>
  <div class="relative">
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      @change="handleFileSelect"
      :accept="accept"
    />
    <button
      @click="fileInput?.click()"
      class="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
      :title="tooltip"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

interface Props {
  accept?: string;
  tooltip?: string;
}

interface Emits {
  (e: "file-selected", file: File): void;
}

const props = withDefaults(defineProps<Props>(), {
  accept: "*/*",
  tooltip: "Прикрепить файл",
});

const emit = defineEmits<Emits>();

const fileInput = ref<HTMLInputElement | null>(null);

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    // Проверка размера файла (10MB максимум)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert("Файл слишком большой. Максимальный размер: 10MB");
      return;
    }

    emit("file-selected", file);
    // Очищаем input для возможности повторного выбора того же файла
    if (fileInput.value) {
      fileInput.value.value = "";
    }
  }
};
</script>

