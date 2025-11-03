import { ref, computed, watch } from "vue";
import type {
  ChatMessage,
  ChatFileMessage,
  ChatReaction,
  ChatRating,
} from "./useWebSocket";

// Объединенный тип сообщения
export type ChatMessageType = ChatMessage | ChatFileMessage;

export const useChat = (
  sendChatMessage: (roomId: string, text: string, userName: string) => boolean,
  sendChatFile: (
    roomId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    fileData: string,
    userName: string
  ) => boolean,
  sendChatReaction: (
    roomId: string,
    messageId: string,
    emoji: string,
    userName: string
  ) => boolean,
  sendChatRating: (
    roomId: string,
    messageId: string,
    rating: "like" | "dislike",
    userName: string
  ) => boolean,
  peerId: string,
  userName: string
) => {
  // Массив всех сообщений текущей комнаты
  const messages = ref<ChatMessageType[]>([]);
  const currentRoomId = ref<string | null>(null);

  // Загрузка истории из localStorage
  const loadHistory = (roomId: string) => {
    try {
      const key = `chat-history-${roomId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        messages.value = parsed;
        console.log(
          `[Chat] Загружена история для комнаты ${roomId}:`,
          parsed.length,
          "сообщений"
        );
      }
    } catch (error) {
      console.error("[Chat] Ошибка загрузки истории:", error);
    }
  };

  // Сохранение истории в localStorage
  const saveHistory = (roomId: string) => {
    try {
      const key = `chat-history-${roomId}`;
      // Сохраняем только последние 50 сообщений для экономии места
      const toSave = messages.value.slice(-50);
      localStorage.setItem(key, JSON.stringify(toSave));
      console.log(`[Chat] История сохранена для комнаты ${roomId}`);
    } catch (error) {
      console.error("[Chat] Ошибка сохранения истории:", error);
    }
  };

  // Установка текущей комнаты
  const setRoom = (roomId: string | null) => {
    // Сохраняем предыдущую комнату перед сменой
    if (currentRoomId.value) {
      saveHistory(currentRoomId.value);
    }

    // Очищаем сообщения
    messages.value = [];

    // Загружаем новую комнату
    if (roomId) {
      currentRoomId.value = roomId;
      loadHistory(roomId);
    } else {
      currentRoomId.value = null;
    }
  };

  // Отправка текстового сообщения
  const sendMessage = (text: string) => {
    if (!currentRoomId.value || !text.trim()) {
      return false;
    }

    const success = sendChatMessage(currentRoomId.value, text.trim(), userName);
    if (success) {
      // Сохраняем историю после отправки
      setTimeout(() => {
        if (currentRoomId.value) {
          saveHistory(currentRoomId.value);
        }
      }, 100);
    }
    return success;
  };

  // Отправка файла
  const sendFile = async (file: File) => {
    if (!currentRoomId.value) {
      return false;
    }

    // Проверка размера файла (10MB максимум)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.error("[Chat] Файл слишком большой:", file.size);
      return false;
    }

    try {
      // Конвертируем файл в base64
      const fileData = await fileToBase64(file);
      const success = sendChatFile(
        currentRoomId.value,
        file.name,
        file.type,
        file.size,
        fileData,
        userName
      );

      if (success) {
        // Сохраняем историю после отправки
        setTimeout(() => {
          if (currentRoomId.value) {
            saveHistory(currentRoomId.value);
          }
        }, 100);
      }
      return success;
    } catch (error) {
      console.error("[Chat] Ошибка отправки файла:", error);
      return false;
    }
  };

  // Добавление реакции
  const addReaction = (messageId: string, emoji: string) => {
    if (!currentRoomId.value) {
      return false;
    }

    return sendChatReaction(currentRoomId.value, messageId, emoji, userName);
  };

  // Рейтинг сообщения
  const rateMessage = (messageId: string, rating: "like" | "dislike") => {
    if (!currentRoomId.value) {
      return false;
    }

    return sendChatRating(currentRoomId.value, messageId, rating, userName);
  };

  // Добавление сообщения в список (вызывается из обработчиков WebSocket)
  const addMessage = (message: ChatMessageType) => {
    // Проверяем, нет ли уже такого сообщения
    const exists = messages.value.some((msg) => msg.id === message.id);
    if (!exists) {
      messages.value.push(message);
      // Сохраняем историю после добавления
      setTimeout(() => {
        if (currentRoomId.value) {
          saveHistory(currentRoomId.value);
        }
      }, 100);
    }
  };

  // Добавление реакции к сообщению
  const addReactionToMessage = (reaction: ChatReaction) => {
    const message = messages.value.find((msg) => msg.id === reaction.messageId);
    if (message) {
      if (!message.reactions) {
        message.reactions = [];
      }
      // Проверяем, нет ли уже реакции от этого пользователя
      const existingIndex = message.reactions.findIndex(
        (r) => r.peerId === reaction.peerId && r.emoji === reaction.emoji
      );
      if (existingIndex === -1) {
        message.reactions.push(reaction);
      }
    }
  };

  // Обновление рейтинга сообщения
  const updateMessageRating = (rating: ChatRating) => {
    const message = messages.value.find((msg) => msg.id === rating.messageId);
    if (message) {
      message.rating = rating;
    }
  };

  // Функция конвертации файла в base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Убираем префикс data:image/png;base64, если есть
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Автоматическое сохранение при изменении сообщений
  watch(
    messages,
    () => {
      if (currentRoomId.value && messages.value.length > 0) {
        // Дебаунс для сохранения - не чаще чем раз в 5 секунд
        const timeoutId = setTimeout(() => {
          saveHistory(currentRoomId.value!);
        }, 5000);

        return () => clearTimeout(timeoutId);
      }
    },
    { deep: true }
  );

  return {
    messages,
    currentRoomId,
    setRoom,
    sendMessage,
    sendFile,
    addReaction,
    rateMessage,
    addMessage,
    addReactionToMessage,
    updateMessageRating,
    loadHistory,
    saveHistory,
  };
};
