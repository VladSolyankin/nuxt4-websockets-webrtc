<template>
  <div
    class="flex flex-col justify-between h-full bg-white rounded-lg shadow border border-gray-200"
  >
    <!-- Заголовок -->
    <div class="p-4 border-b border-gray-200">
      <h2 class="text-lg font-semibold">Чат</h2>
      <p v-if="roomId" class="text-sm text-gray-500">Комната: {{ roomId }}</p>
    </div>

    <!-- Список сообщений -->
    <div
      ref="messagesContainer"
      class="max-h-[500px] flex-1 overflow-y-auto p-2"
    >
      <div v-if="messages.length === 0" class="text-center text-gray-500 py-8">
        Нет сообщений. Начните общение!
      </div>
      <ChatMessage
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :peer-id="peerId"
        @reaction="handleReaction"
        @rating="handleRating"
      />
    </div>

    <!-- Поле ввода -->
    <div class="p-3 border-t border-gray-200">
      <!-- Превью файла -->
      <div
        v-if="pendingFile"
        class="mb-2 p-2 bg-gray-100 rounded flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-gray-500"
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
          <span class="text-sm">{{ pendingFile.name }}</span>
        </div>
        <button
          @click="pendingFile = null"
          class="text-gray-500 hover:text-gray-700"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Поле ввода и кнопки -->
      <div class="flex gap-2">
        <!-- Кнопка файла -->
        <FileUpload
          @file-selected="handleFileSelect"
          tooltip="Прикрепить файл"
        />

        <!-- Кнопка эмодзи -->
        <div class="relative">
          <button
            @click="showEmojiPicker = !showEmojiPicker"
            class="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
            :class="{ 'bg-gray-100': showEmojiPicker }"
            title="Эмодзи"
          >
            😀
          </button>
          <EmojiPicker :is-open="showEmojiPicker" @select="handleEmojiSelect" />
        </div>

        <!-- Поле ввода -->
        <div class="flex-1 relative">
          <textarea
            v-model="messageText"
            @keydown.enter.exact.prevent="handleSendMessage"
            @keydown.enter.shift.exact="messageText += '\n'"
            @input="handleInput"
            placeholder="Введите сообщение..."
            rows="1"
            class="w-full px-3 py-2 overflow-y-hidden border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            style="min-height: 40px; max-height: 120px"
            ref="messageInput"
          ></textarea>
          <!-- Автодополнение эмодзи -->
          <div
            v-if="emojiSuggestions.length > 0"
            class="absolute bottom-full left-0 mb-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto z-50"
          >
            <button
              v-for="(suggestion, index) in emojiSuggestions"
              :key="index"
              @click="insertEmojiSuggestion(suggestion)"
              class="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            >
              <span>{{ suggestion.emoji }}</span>
              <span class="text-sm text-gray-600">{{ suggestion.code }}</span>
            </button>
          </div>
        </div>

        <!-- Кнопка отправки -->
        <button
          @click="handleSendMessage"
          :disabled="!canSend"
          class="my-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          title="Отправить (Enter)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 transform rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import type { ChatMessageType } from "~/composables/useChat";
import ChatMessage from "./ChatMessage.vue";
import EmojiPicker from "./EmojiPicker.vue";
import FileUpload from "./FileUpload.vue";

interface Props {
  messages: ChatMessageType[];
  roomId: string | null;
  peerId: string;
  userName: string;
  onSendMessage: (text: string) => boolean;
  onSendFile: (file: File) => Promise<boolean>;
  onReaction: (messageId: string, emoji: string) => boolean;
  onRating: (messageId: string, rating: "like" | "dislike") => boolean;
}

const props = defineProps<Props>();

const messageText = ref("");
const showEmojiPicker = ref(false);
const pendingFile = ref<File | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const messageInput = ref<HTMLTextAreaElement | null>(null);
const emojiSuggestions = ref<Array<{ emoji: string; code: string }>>([]);

// Словарь эмодзи для автодополнения
const emojiMap: Record<string, string> = {
  smile: "😊",
  happy: "😀",
  laugh: "😂",
  love: "❤️",
  like: "👍",
  dislike: "👎",
  heart: "❤️",
  fire: "🔥",
  cry: "😢",
  surprised: "😮",
  wink: "😉",
  cool: "😎",
  sad: "😢",
  angry: "😡",
  confused: "😕",
  tired: "😴",
  hungry: "😋",
  sick: "🤒",
  party: "🎉",
  clap: "👏",
  thumbsup: "👍",
  thumbsdown: "👎",
  ok: "👌",
  peace: "✌️",
  rock: "🤘",
  wave: "👋",
  point: "👉",
};

// Проверка возможности отправки
const canSend = computed(() => {
  return (
    (messageText.value.trim().length > 0 || pendingFile.value !== null) &&
    props.roomId !== null
  );
});

// Автопрокрутка к новым сообщениям
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    scrollToBottom();
  }
);

// Обработка ввода для автодополнения эмодзи
const handleInput = () => {
  const text = messageText.value;
  const match = text.match(/:(\w+)$/);

  if (match) {
    const query = match[1].toLowerCase();
    const suggestions = Object.entries(emojiMap)
      .filter(([code]) => code.toLowerCase().startsWith(query))
      .slice(0, 5)
      .map(([code, emoji]) => ({ emoji, code: `:${code}:` }));

    emojiSuggestions.value = suggestions;
  } else {
    emojiSuggestions.value = [];
  }
};

// Вставка выбранного эмодзи из автодополнения
const insertEmojiSuggestion = (suggestion: { emoji: string; code: string }) => {
  const text = messageText.value;
  const match = text.match(/:(\w+)$/);
  if (match) {
    const start = text.lastIndexOf(match[0]);
    messageText.value =
      text.slice(0, start) +
      suggestion.emoji +
      " " +
      text.slice(start + match[0].length);
  }
  emojiSuggestions.value = [];
  if (messageInput.value) {
    messageInput.value.focus();
  }
};

// Обработка выбора эмодзи из пикера
const handleEmojiSelect = (emoji: string) => {
  messageText.value += emoji + " ";
  showEmojiPicker.value = false;
  if (messageInput.value) {
    messageInput.value.focus();
  }
};

// Обработка выбора файла
const handleFileSelect = (file: File) => {
  pendingFile.value = file;
};

// Отправка сообщения
const handleSendMessage = async () => {
  if (!canSend.value) return;

  // Отправляем файл, если есть
  if (pendingFile.value) {
    const success = await props.onSendFile(pendingFile.value);
    if (success) {
      pendingFile.value = null;
    }
  }

  // Отправляем текст, если есть
  if (messageText.value.trim()) {
    const success = props.onSendMessage(messageText.value.trim());
    if (success) {
      messageText.value = "";
      emojiSuggestions.value = [];
      // Автоматически закрываем пикер эмодзи
      showEmojiPicker.value = false;
    }
  }

  // Фокус на поле ввода
  await nextTick();
  if (messageInput.value) {
    messageInput.value.focus();
    // Автоматически подстраиваем высоту textarea
    adjustTextareaHeight(messageInput.value);
  }
};

// Подстройка высоты textarea
const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
};

// Прокрутка вниз
const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

// Обработка реакции
const handleReaction = (messageId: string, emoji: string) => {
  props.onReaction(messageId, emoji);
};

// Обработка рейтинга
const handleRating = (messageId: string, rating: "like" | "dislike") => {
  props.onRating(messageId, rating);
};

// Закрытие пикера эмодзи при клике вне его
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest(".relative")) {
    showEmojiPicker.value = false;
  }
};

// Автопрокрутка при монтировании
onMounted(() => {
  scrollToBottom();
  // Подстраиваем высоту textarea при изменении текста
  watch(messageText, () => {
    nextTick(() => {
      if (messageInput.value) {
        adjustTextareaHeight(messageInput.value);
      }
    });
  });
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>
