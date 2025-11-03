<template>
  <div class="min-h-screen bg-gray-100 p-4 md:p-8">
    <div class="max-w-7xl mx-auto space-y-6">
      <h1 class="text-3xl font-bold text-center">WebSockets + WebRTC</h1>

      <!-- Ошибки -->
      <div
        v-if="errorMessage"
        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
      >
        <span class="block sm:inline">{{ errorMessage }}</span>
        <button
          @click="errorMessage = ''"
          class="absolute top-0 bottom-0 right-0 px-4 py-3"
        >
          <span class="text-red-700 text-xl">&times;</span>
        </button>
      </div>

      <!-- Уведомления -->
      <div
        v-if="notificationMessage"
        class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded relative"
      >
        <span class="block sm:inline">{{ notificationMessage }}</span>
        <button
          @click="notificationMessage = ''"
          class="absolute top-0 bottom-0 right-0 px-4 py-3"
        >
          <span class="text-blue-700 text-xl">&times;</span>
        </button>
      </div>

      <!-- Форма ввода имени -->
      <div v-if="!userName" class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4">Введите ваше имя</h2>
        <div class="flex gap-2">
          <input
            v-model="tempUserName"
            type="text"
            placeholder="Ваше имя"
            class="flex-1 px-3 py-2 border rounded"
            @keyup.enter="setUserName"
          />
          <button
            @click="setUserName"
            :disabled="!tempUserName.trim()"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Продолжить
          </button>
        </div>
      </div>

      <!-- Основной контент -->
      <div v-else class="space-y-6">
        <!-- Список комнат -->
        <div v-if="!currentRoomId">
          <RoomList
            :rooms="rooms"
            :is-connected="isConnected"
            :current-room-id="currentRoomId"
            :get-rooms="getRooms"
            :join-room="(roomId: string) => { handleJoinRoom(roomId); return true; }"
            @room-created="handleRoomCreated"
          />
        </div>

        <!-- Контент комнаты -->
        <div v-else class="space-y-6">
          <!-- Информация о комнате -->
          <div class="bg-white rounded-lg shadow p-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-semibold">
                  Комната: {{ currentRoomId }}
                </h2>
                <p class="text-gray-600">Участников: {{ participantsCount }}</p>
              </div>
              <button
                @click="handleLeaveRoom"
                class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Покинуть комнату
              </button>
            </div>
          </div>

          <!-- Основной контент: видео и чат -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Левая часть: видео и участники -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Видео сетка -->
              <VideoGrid
                :local-stream="localStream"
                :remote-streams="remoteStreams"
                :participants="participants"
                :user-name="userName"
                :audio-enabled="audioEnabled"
                :video-enabled="videoEnabled"
                :on-toggle-audio="handleToggleAudio"
                :on-toggle-video="handleToggleVideo"
              />

              <!-- Список участников -->
              <ParticipantList
                :participants="participants"
                :peer-id="peerId"
                :user-name="userName"
                :audio-enabled="audioEnabled"
                :video-enabled="videoEnabled"
                :remote-streams="remoteStreams"
              />
            </div>

            <!-- Правая часть: чат -->
            <div class="lg:col-span-1">
              <Chat
                :messages="chatMessages"
                :room-id="currentRoomId"
                :peer-id="peerId || ''"
                :user-name="userName"
                :on-send-message="handleChatSendMessage"
                :on-send-file="handleChatSendFile"
                :on-reaction="handleChatReaction"
                :on-rating="handleChatRating"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { useWebRTC } from "~/composables/useWebRTC";
import type { RemoteStream } from "~/composables/useWebRTC";
import { useWebSocket } from "~/composables/useWebSocket";
import { useChat } from "~/composables/useChat";
import Chat from "~/components/Chat.vue";
import type {
  ChatMessage,
  ChatFileMessage,
  ChatReaction,
  ChatRating,
} from "~/composables/useWebSocket";

const {
  isConnected,
  peerId,
  connectionStatus,
  currentRoomId,
  rooms,
  participants,
  participantsCount,
  joinRoom,
  leaveRoom,
  getRooms,
  toggleAudio: wsToggleAudio,
  toggleVideo: wsToggleVideo,
  sendWebRTCOffer,
  sendWebRTCAnswer,
  sendIceCandidate,
  onRoomParticipants,
  onUserJoined,
  onUserLeft,
  onRoomUpdated,
  onRoomsList,
  onUserAudioToggled,
  onUserVideoToggled,
  onWebRTCOffer,
  onWebRTCAnswer,
  onWebRTCIceCandidate,
  onError,
  sendChatMessage,
  sendChatFile,
  sendChatReaction,
  sendChatRating,
  onChatMessage,
  onChatFile,
  onChatReaction,
  onChatRating,
} = useWebSocket();

const userName = ref("");
const tempUserName = ref("");
const errorMessage = ref("");
const notificationMessage = ref("");
const pendingRoomId = ref<string | null>(null); // Комната, к которой пытаемся присоединиться

// WebRTC instance
const webrtc = ref<ReturnType<typeof useWebRTC> | null>(null);

// Промежуточные refs для реактивности (вместо computed)
const localStream = ref<MediaStream | null>(null);
const remoteStreams = ref<Map<string, RemoteStream>>(new Map());
const audioEnabled = ref(false);
const videoEnabled = ref(false);

// Инициализация чата (будет переинициализирована при изменении peerId и userName)
const chat = ref<ReturnType<typeof useChat> | null>(null);
const chatMessages = ref<any[]>([]);

// Инициализация чата при наличии peerId и userName
watch(
  [() => peerId.value, () => userName.value],
  ([newPeerId, newUserName]) => {
    if (newPeerId && newUserName) {
      chat.value = useChat(
        sendChatMessage,
        sendChatFile,
        sendChatReaction,
        sendChatRating,
        newPeerId,
        newUserName
      );
      if (chat.value) {
        chatMessages.value = [...chat.value.messages];
      }
    }
  },
  { immediate: true }
);

// Упрощенный watch для синхронизации localStream
watch(
  () => webrtc.value?.localStream,
  (streamRef) => {
    const stream = streamRef ? (streamRef as any).value : null;
    if (stream !== localStream.value) {
      console.log("[App] localStream обновлен:", {
        streamId: stream?.id || "null",
        videoTracks: stream?.getVideoTracks().length || 0,
        audioTracks: stream?.getAudioTracks().length || 0,
      });
      localStream.value = stream;
    }
  },
  { immediate: true }
);

// Упрощенный watch для синхронизации remoteStreams
watch(
  () => webrtc.value?.remoteStreams,
  (streamsRef) => {
    const streams = streamsRef ? (streamsRef as any).value : new Map();
    remoteStreams.value = streams;
    console.log("[App] remoteStreams обновлен, количество:", streams.size);
  },
  { immediate: true, deep: true }
);

// Упрощенный watch для синхронизации audioEnabled
watch(
  () => webrtc.value?.audioEnabled,
  (audioEnabledRef) => {
    const newValue = audioEnabledRef
      ? (audioEnabledRef as any).value ?? false
      : false;
    if (audioEnabled.value !== newValue) {
      audioEnabled.value = newValue;
      console.log("[App] audioEnabled обновлен:", newValue);
    }
  },
  { immediate: true }
);

// Упрощенный watch для синхронизации videoEnabled
watch(
  () => webrtc.value?.videoEnabled,
  (videoEnabledRef) => {
    const newValue = videoEnabledRef
      ? (videoEnabledRef as any).value ?? false
      : false;
    if (videoEnabled.value !== newValue) {
      videoEnabled.value = newValue;
      console.log("[App] videoEnabled обновлен:", newValue);
    }
  },
  { immediate: true }
);

// Установка имени пользователя
const setUserName = () => {
  if (tempUserName.value.trim()) {
    userName.value = tempUserName.value.trim();
    tempUserName.value = "";
  }
};

// Присоединение к комнате
const handleJoinRoom = async (roomId: string) => {
  if (!isConnected.value) {
    errorMessage.value = "Ожидание подключения к серверу...";
    pendingRoomId.value = roomId;
    return;
  }

  if (!peerId.value) {
    errorMessage.value = "Ожидание получения идентификатора...";
    pendingRoomId.value = roomId;
    return;
  }

  pendingRoomId.value = null;
  joinRoom(roomId, peerId.value, userName.value);
  notificationMessage.value = `Присоединение к комнате ${roomId}...`;
};

// Обработка создания комнаты
const handleRoomCreated = (roomId: string) => {
  handleJoinRoom(roomId);
};

// Выход из комнаты
const handleLeaveRoom = async () => {
  if (currentRoomId.value) {
    // Закрываем все WebRTC соединения
    if (webrtc.value) {
      webrtc.value.closeAllConnections();
      webrtc.value.stopLocalStream();
    }

    leaveRoom(currentRoomId.value);
    notificationMessage.value = "Вы покинули комнату";
  }
};

// Переключение аудио
const handleToggleAudio = async (enabled: boolean) => {
  if (webrtc.value && currentRoomId.value) {
    webrtc.value.toggleAudio(enabled);
    wsToggleAudio(currentRoomId.value, enabled);
  }
};

// Переключение видео
const handleToggleVideo = async (enabled: boolean) => {
  if (webrtc.value && currentRoomId.value) {
    webrtc.value.toggleVideo(enabled);
    wsToggleVideo(currentRoomId.value, enabled);
  }
};

// Обработка списка участников комнаты
onRoomParticipants.value = (roomInfo) => {
  console.log("[App] Получен список участников:", roomInfo);
  // Инициализируем WebRTC соединения с существующими участниками
  if (webrtc.value && roomInfo.participants.length > 0) {
    roomInfo.participants.forEach((participant) => {
      webrtc.value?.initiateConnection(participant.peerId);
    });
  }
};

// Обработка присоединения пользователя
onUserJoined.value = (participant) => {
  console.log("[App] Пользователь присоединился:", participant);
  notificationMessage.value = `${
    participant.userName || "Пользователь"
  } присоединился к комнате`;

  // Инициализируем WebRTC соединение с новым участником
  if (webrtc.value && peerId.value && participant.peerId !== peerId.value) {
    webrtc.value.initiateConnection(participant.peerId);
  }
};

// Обработка выхода пользователя
onUserLeft.value = (participant) => {
  console.log("[App] Пользователь покинул комнату:", participant);
  notificationMessage.value = `${
    participant.userName || "Пользователь"
  } покинул комнату`;

  // Закрываем WebRTC соединение
  if (webrtc.value) {
    webrtc.value.closePeerConnection(participant.peerId);
  }
};

// Обработка обновления комнаты
onRoomUpdated.value = (roomId, count) => {
  console.log(`[App] Комната ${roomId} обновлена, участников: ${count}`);
};

// Обработка списка комнат
onRoomsList.value = (roomsList) => {
  console.log("[App] Получен список комнат:", roomsList);
};

// Обработка переключения аудио другого пользователя
onUserAudioToggled.value = (peerId, enabled) => {
  console.log(
    `[App] Пользователь ${peerId} ${enabled ? "включил" : "выключил"} аудио`
  );
  if (webrtc.value) {
    webrtc.value.setRemoteMediaState(peerId, enabled, true);
  }
};

// Обработка переключения видео другого пользователя
onUserVideoToggled.value = (peerId, enabled) => {
  console.log(
    `[App] Пользователь ${peerId} ${enabled ? "включил" : "выключил"} видео`
  );
  if (webrtc.value) {
    webrtc.value.setRemoteMediaState(peerId, true, enabled);
  }
};

// Обработка WebRTC offer
onWebRTCOffer.value = async (offer, senderPeerId) => {
  console.log("[App] Получен WebRTC offer от", senderPeerId);
  if (webrtc.value) {
    await webrtc.value.handleOffer(offer, senderPeerId);
  }
};

// Обработка WebRTC answer
onWebRTCAnswer.value = async (answer, senderPeerId) => {
  console.log("[App] Получен WebRTC answer от", senderPeerId);
  if (webrtc.value) {
    await webrtc.value.handleAnswer(answer, senderPeerId);
  }
};

// Обработка ICE кандидата
onWebRTCIceCandidate.value = async (candidate, senderPeerId) => {
  console.log("[App] Получен ICE candidate от", senderPeerId);
  if (webrtc.value) {
    await webrtc.value.handleIceCandidate(candidate, senderPeerId);
  }
};

// Обработка ошибок
onError.value = (message) => {
  errorMessage.value = message;
};

// Обработка сообщений чата
onChatMessage.value = (message: ChatMessage) => {
  if (chat.value) {
    chat.value.addMessage(message);
    chatMessages.value = [...chat.value.messages];
  }
};

onChatFile.value = (message: ChatFileMessage) => {
  if (chat.value) {
    chat.value.addMessage(message);
    chatMessages.value = [...chat.value.messages];
  }
};

onChatReaction.value = (reaction: ChatReaction) => {
  if (chat.value) {
    chat.value.addReactionToMessage(reaction);
    chatMessages.value = [...chat.value.messages];
  }
};

onChatRating.value = (rating: ChatRating) => {
  if (chat.value) {
    chat.value.updateMessageRating(rating);
    chatMessages.value = [...chat.value.messages];
  }
};

// Обработчики для компонента Chat
const handleChatSendMessage = (text: string): boolean => {
  if (!currentRoomId.value || !peerId.value || !chat.value) return false;
  return chat.value.sendMessage(text);
};

const handleChatSendFile = async (file: File): Promise<boolean> => {
  if (!currentRoomId.value || !peerId.value || !chat.value) return false;
  return chat.value.sendFile(file);
};

const handleChatReaction = (messageId: string, emoji: string): boolean => {
  if (!currentRoomId.value || !peerId.value || !chat.value) return false;
  return chat.value.addReaction(messageId, emoji);
};

const handleChatRating = (
  messageId: string,
  rating: "like" | "dislike"
): boolean => {
  if (!currentRoomId.value || !peerId.value || !chat.value) return false;
  return chat.value.rateMessage(messageId, rating);
};

// Синхронизация чата с комнатой
watch(
  () => currentRoomId.value,
  (newRoomId) => {
    if (chat.value) {
      if (newRoomId) {
        chat.value.setRoom(newRoomId);
        chatMessages.value = [...chat.value.messages];
      } else {
        chat.value.setRoom(null);
        chatMessages.value = [];
      }
    }
  },
  { immediate: true }
);

// Обновление chatMessages при изменении сообщений в чате
watch(
  () => chat.value?.messages,
  () => {
    if (chat.value) {
      chatMessages.value = [...chat.value.messages];
    }
  },
  { deep: true }
);

// Инициализация WebRTC при присоединении к комнате
watch(
  [() => currentRoomId.value, () => peerId.value],
  async ([newRoomId, newPeerId]) => {
    // Закрываем предыдущее соединение при выходе из комнаты
    if (!newRoomId || !newPeerId) {
      if (webrtc.value) {
        webrtc.value.closeAllConnections();
        webrtc.value.stopLocalStream();
        webrtc.value = null;
      }
      return;
    }

    // Инициализируем новое WebRTC соединение
    if (newRoomId && newPeerId && !webrtc.value) {
      console.log("[App] Инициализация WebRTC для комнаты:", newRoomId);
      const webrtcInstance = useWebRTC(
        sendWebRTCOffer,
        sendWebRTCAnswer,
        sendIceCandidate,
        newPeerId,
        newRoomId
      );
      webrtc.value = webrtcInstance;

      try {
        const stream = await webrtcInstance.initializeLocalStream();
        console.log("[App] Локальный поток получен:", {
          streamId: stream?.id,
          audioTracks: stream?.getAudioTracks().length || 0,
          videoTracks: stream?.getVideoTracks().length || 0,
        });

        // Принудительно синхронизируем поток сразу
        if (webrtc.value?.localStream) {
          localStream.value = (webrtc.value.localStream as any).value;
          console.log("[App] Поток принудительно синхронизирован:", {
            streamId: localStream.value?.id || "null",
            videoTracks: localStream.value?.getVideoTracks().length || 0,
            audioTracks: localStream.value?.getAudioTracks().length || 0,
          });
        }

        // Принудительно синхронизируем состояние медиа сразу
        if (webrtc.value?.audioEnabled) {
          const audioValue = (webrtc.value.audioEnabled as any).value ?? false;
          audioEnabled.value = audioValue;
          console.log(
            "[App] audioEnabled принудительно синхронизирован:",
            audioValue
          );
        }
        if (webrtc.value?.videoEnabled) {
          const videoValue = (webrtc.value.videoEnabled as any).value ?? false;
          videoEnabled.value = videoValue;
          console.log(
            "[App] videoEnabled принудительно синхронизирован:",
            videoValue
          );
        }

        // Используем nextTick для гарантии, что watch сработали и refs обновлены
        await nextTick();

        // Проверяем наличие треков в потоке
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();

        if (videoTracks.length === 0) {
          console.warn("[App] Получен поток без видео треков");
          errorMessage.value =
            "Камера недоступна. Проверьте разрешения браузера.";
        }

        if (audioTracks.length === 0) {
          console.warn("[App] Получен поток без аудио треков");
          // Не показываем ошибку для аудио, так как это может быть намеренно
        }

        // Проверяем, что поток синхронизировался
        if (localStream.value) {
          console.log("[App] Поток успешно синхронизирован в localStream:", {
            streamId: localStream.value.id,
            videoTracks: localStream.value.getVideoTracks().length,
            audioTracks: localStream.value.getAudioTracks().length,
            matches: localStream.value === stream,
            audioEnabled: audioEnabled.value,
            videoEnabled: videoEnabled.value,
          });
          notificationMessage.value = "Медиа потоки инициализированы";
        } else {
          console.error(
            "[App] КРИТИЧЕСКАЯ ОШИБКА: Поток не синхронизировался!"
          );
          // Принудительно устанавливаем поток
          localStream.value = stream;
          console.log("[App] Поток принудительно установлен");
          notificationMessage.value = "Медиа потоки инициализированы";
        }

        // Принудительно обновляем состояние медиа после небольшой задержки
        setTimeout(() => {
          if (webrtc.value?.audioEnabled) {
            const audioValue =
              (webrtc.value.audioEnabled as any).value ?? false;
            if (audioEnabled.value !== audioValue) {
              audioEnabled.value = audioValue;
              console.log(
                "[App] audioEnabled обновлен после задержки:",
                audioValue
              );
            }
          }
          if (webrtc.value?.videoEnabled) {
            const videoValue =
              (webrtc.value.videoEnabled as any).value ?? false;
            if (videoEnabled.value !== videoValue) {
              videoEnabled.value = videoValue;
              console.log(
                "[App] videoEnabled обновлен после задержки:",
                videoValue
              );
            }
          }
          console.log("[App] Финальное состояние медиа:", {
            audioEnabled: audioEnabled.value,
            videoEnabled: videoEnabled.value,
          });
        }, 100);
      } catch (error: any) {
        console.error("[App] Ошибка инициализации медиа потоков:", error);

        // Определяем тип ошибки и показываем соответствующее сообщение
        let errorMsg = "Не удалось получить доступ к камере/микрофону.";

        if (error.name === "NotAllowedError") {
          errorMsg =
            "Доступ к камере/микрофону запрещен. Разрешите доступ в настройках браузера.";
        } else if (error.name === "NotFoundError") {
          errorMsg =
            "Камера или микрофон не найдены. Проверьте подключение устройств.";
        } else if (error.name === "NotReadableError") {
          errorMsg = "Камера или микрофон используются другим приложением.";
        } else if (error.name === "OverconstrainedError") {
          errorMsg = "Требуемые настройки камеры/микрофона не поддерживаются.";
        } else if (error.name === "TypeError") {
          errorMsg =
            "Медиа устройства недоступны. Убедитесь, что вы используете HTTPS или localhost.";
        } else if (error.message) {
          errorMsg = `Ошибка: ${error.message}`;
        }

        errorMessage.value = errorMsg;
        webrtc.value = null;
      }
    }
  },
  { immediate: true }
);

// Загрузка списка комнат при подключении
watch(
  () => isConnected.value,
  (connected) => {
    if (connected) {
      getRooms();
    }
  }
);

// Автоматическое присоединение к комнате при получении peerId
watch(
  () => peerId.value,
  (newPeerId) => {
    if (newPeerId && pendingRoomId.value) {
      // Очищаем ошибку, если она была
      errorMessage.value = "";
      // Присоединяемся к отложенной комнате
      handleJoinRoom(pendingRoomId.value);
    }
  }
);

onMounted(() => {
  // Автоматически закрываем уведомления через 5 секунд
  setInterval(() => {
    if (notificationMessage.value) {
      notificationMessage.value = "";
    }
  }, 5000);
});
</script>
