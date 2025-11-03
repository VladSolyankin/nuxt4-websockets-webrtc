<template>
  <div
    class="p-3 hover:bg-gray-50 transition-colors"
    :class="{ 'bg-blue-50': isOwnMessage }"
  >
    <div class="flex gap-2">
      <!-- Аватар -->
      <div
        class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold"
      >
        {{ userInitials }}
      </div>

      <!-- Контент сообщения -->
      <div class="flex-1 min-w-0">
        <!-- Имя и время -->
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm">{{ message.userName }}</span>
          <span class="text-xs text-gray-500">{{ formattedTime }}</span>
        </div>

        <!-- Текст сообщения -->
        <div v-if="isTextMessage" class="text-sm text-gray-800 mb-2">
          {{ (message as ChatMessage).text }}
        </div>

        <!-- Файл -->
        <div v-if="isFileMessage" class="mb-2">
          <div
            v-if="isImageFile"
            class="max-w-xs rounded-lg overflow-hidden cursor-pointer"
            @click="openImagePreview"
          >
            <img
              :src="fileDataUrl"
              :alt="(message as ChatFileMessage).fileName"
              class="max-w-full h-auto"
            />
          </div>
          <div
            v-else
            class="flex items-center gap-2 p-2 bg-gray-100 rounded border border-gray-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-8 w-8 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm truncate">
                {{ (message as ChatFileMessage).fileName }}
              </div>
              <div class="text-xs text-gray-500">
                {{ formatFileSize((message as ChatFileMessage).fileSize) }}
              </div>
            </div>
            <a
              :href="fileDataUrl"
              :download="(message as ChatFileMessage).fileName"
              class="text-blue-500 hover:text-blue-700"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </a>
          </div>
        </div>

        <!-- Реакции -->
        <div
          v-if="message.reactions && message.reactions.length > 0"
          class="mb-2"
        >
          <div class="flex flex-wrap gap-1">
            <button
              v-for="(reaction, index) in groupedReactions"
              :key="index"
              @click="handleReactionClick(reaction.emoji)"
              class="px-2 py-1 bg-gray-100 rounded-full text-xs hover:bg-gray-200 transition-colors flex items-center gap-1"
            >
              <span>{{ reaction.emoji }}</span>
              <span v-if="reaction.count > 1">{{ reaction.count }}</span>
            </button>
          </div>
        </div>

        <!-- Действия -->
        <div class="flex items-center gap-2 mt-2">
          <!-- Кнопки реакций -->
          <div class="flex gap-1">
            <button
              v-for="emoji in quickReactions"
              :key="emoji"
              @click="handleReactionClick(emoji)"
              class="p-1 hover:bg-gray-200 rounded transition-colors text-sm"
              :title="emoji"
            >
              {{ emoji }}
            </button>
          </div>

          <!-- Кнопки рейтинга -->
          <div class="flex items-center gap-1 ml-auto">
            <button
              @click="handleRatingClick('like')"
              class="p-1 hover:bg-gray-200 rounded transition-colors flex items-center gap-1"
              :class="{
                'bg-blue-100': message.rating?.userRating === 'like',
              }"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                />
              </svg>
              <span v-if="message.rating?.likes" class="text-xs">
                {{ message.rating.likes }}
              </span>
            </button>
            <button
              @click="handleRatingClick('dislike')"
              class="p-1 hover:bg-gray-200 rounded transition-colors flex items-center gap-1"
              :class="{
                'bg-red-100': message.rating?.userRating === 'dislike',
              }"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
                />
              </svg>
              <span v-if="message.rating?.dislikes" class="text-xs">
                {{ message.rating.dislikes }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage, ChatFileMessage } from "~/composables/useWebSocket";
import type { ChatMessageType } from "~/composables/useChat";

interface Props {
  message: ChatMessageType;
  peerId: string;
}

interface Emits {
  (e: "reaction", messageId: string, emoji: string): void;
  (e: "rating", messageId: string, rating: "like" | "dislike"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Популярные реакции для быстрого доступа
const quickReactions = ["👍", "❤️", "😂", "😮", "😢", "❤️‍🔥"];

// Проверка типа сообщения
const isTextMessage = computed(() => {
  return "text" in props.message;
});

const isFileMessage = computed(() => {
  return "fileName" in props.message;
});

const isOwnMessage = computed(() => {
  return props.message.peerId === props.peerId;
});

// Инициалы пользователя
const userInitials = computed(() => {
  const name = props.message.userName || "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});

// Форматирование времени
const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return "только что";
  }
  if (minutes < 60) {
    return `${minutes} мин назад`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ч назад`;
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
});

// Проверка типа файла
const isImageFile = computed(() => {
  if (!isFileMessage.value) return false;
  const fileMessage = props.message as ChatFileMessage;
  return fileMessage.fileType.startsWith("image/");
});

// Data URL для файла
const fileDataUrl = computed(() => {
  if (!isFileMessage.value) return "";
  const fileMessage = props.message as ChatFileMessage;
  const mimeType = fileMessage.fileType || "application/octet-stream";
  return `data:${mimeType};base64,${fileMessage.fileData}`;
});

// Группировка реакций
const groupedReactions = computed(() => {
  if (!props.message.reactions || props.message.reactions.length === 0) {
    return [];
  }

  const groups = new Map<string, number>();
  props.message.reactions.forEach((reaction) => {
    const count = groups.get(reaction.emoji) || 0;
    groups.set(reaction.emoji, count + 1);
  });

  return Array.from(groups.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
});

// Обработка клика по реакции
const handleReactionClick = (emoji: string) => {
  emit("reaction", props.message.id, emoji);
};

// Обработка клика по рейтингу
const handleRatingClick = (rating: "like" | "dislike") => {
  emit("rating", props.message.id, rating);
};

// Форматирование размера файла
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

// Открытие превью изображения
const openImagePreview = () => {
  if (isImageFile.value && fileDataUrl.value) {
    window.open(fileDataUrl.value, "_blank");
  }
};
</script>
