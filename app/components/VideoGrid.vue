<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h2 class="text-xl font-semibold mb-4">Видео</h2>

    <div v-if="totalParticipants === 0" class="text-gray-500 text-center py-8">
      Нет участников в комнате
    </div>

    <div v-else class="grid gap-4" :class="gridClass">
      <!-- Локальное видео -->
      <div class="relative bg-black rounded-lg overflow-hidden aspect-video">
        <video
          ref="localVideoRef"
          autoplay
          muted
          playsinline
          class="w-full h-full object-cover"
        ></video>
        <div
          class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm z-10"
        >
          {{ userName }} (Вы)
        </div>
        <!-- Overlay "Камера выключена" показываем только когда поток есть, но видео треки disabled -->
        <div
          v-if="localStream && !hasActiveVideoTracks"
          class="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center text-white z-20 pointer-events-none"
        >
          <div class="text-center">
            <div class="text-4xl mb-2">📷</div>
            <div>Камера выключена</div>
          </div>
        </div>
        <!-- Бейдж "Микрофон выключен" показываем только когда поток есть, но аудио треки disabled -->
        <div
          v-if="localStream && !hasActiveAudioTracks"
          class="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs z-30"
        >
          🔇 Микрофон выключен
        </div>
        <!-- Кнопки управления камерой и микрофоном -->
        <div class="absolute bottom-2 right-2 flex gap-2 z-40">
          <!-- Кнопка микрофона -->
          <button
            v-if="props.onToggleAudio"
            @click="handleToggleAudio"
            :class="[
              'p-2 rounded-full transition-all duration-200 flex items-center justify-center',
              hasActiveAudioTracks
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white',
            ]"
            :title="
              hasActiveAudioTracks ? 'Выключить микрофон' : 'Включить микрофон'
            "
          >
            <svg
              v-if="hasActiveAudioTracks"
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
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <svg
              v-else
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
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 3l18 18"
              />
            </svg>
          </button>
          <!-- Кнопка камеры -->
          <button
            v-if="props.onToggleVideo"
            @click="handleToggleVideo"
            :class="[
              'p-2 rounded-full transition-all duration-200 flex items-center justify-center',
              hasActiveVideoTracks
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white',
            ]"
            :title="
              hasActiveVideoTracks ? 'Выключить камеру' : 'Включить камеру'
            "
          >
            <svg
              v-if="hasActiveVideoTracks"
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
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <svg
              v-else
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
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 3l18 18"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Удаленные видео -->
      <div
        v-for="[peerId, remoteStream] in remoteStreams"
        :key="peerId"
        class="relative bg-black rounded-lg overflow-hidden aspect-video"
      >
        <video
          :ref="(el) => setRemoteVideoRef(el, peerId)"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        ></video>
        <div
          class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm"
        >
          {{ getParticipantName(peerId) }}
        </div>
        <div
          v-if="!remoteStream.videoEnabled"
          class="absolute inset-0 bg-gray-900 flex items-center justify-center text-white"
        >
          <div class="text-center">
            <div class="text-4xl mb-2">📷</div>
            <div>Камера выключена</div>
          </div>
        </div>
        <div
          v-if="!remoteStream.audioEnabled"
          class="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs"
        >
          🔇 Микрофон выключен
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Participant } from "~/composables/useWebSocket";
import type { RemoteStream } from "~/composables/useWebRTC";

interface Props {
  localStream: MediaStream | null;
  remoteStreams: Map<string, RemoteStream>;
  participants: Participant[];
  userName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio?: (enabled: boolean) => void;
  onToggleVideo?: (enabled: boolean) => void;
}

const props = defineProps<Props>();

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Map<string, HTMLVideoElement>>(new Map());

// Принудительный триггер для обновления computed при изменении props
const trackUpdateTrigger = ref(0);

const totalParticipants = computed(() => {
  return props.participants.length + 1;
});

const gridClass = computed(() => {
  const count = totalParticipants.value;
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 md:grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 md:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
});

// Проверяем реальное состояние видео треков из потока
// Используем trackUpdateTrigger для принудительного обновления при изменении треков
const hasActiveVideoTracks = computed(() => {
  // Доступ к триггеру для реактивности
  trackUpdateTrigger.value;

  if (!props.localStream) return false;
  const videoTracks = props.localStream.getVideoTracks();
  return videoTracks.length > 0 && videoTracks.some((track) => track.enabled);
});

// Проверяем реальное состояние аудио треков из потока
const hasActiveAudioTracks = computed(() => {
  // Доступ к триггеру для реактивности
  trackUpdateTrigger.value;

  if (!props.localStream) return false;
  const audioTracks = props.localStream.getAudioTracks();
  return audioTracks.length > 0 && audioTracks.some((track) => track.enabled);
});

// Watch для обновления триггера при изменении props или состояния треков
watch(
  [() => props.localStream, () => props.audioEnabled, () => props.videoEnabled],
  () => {
    // Принудительно обновляем computed при изменении props
    trackUpdateTrigger.value++;
  },
  { immediate: true }
);

// Периодическая проверка состояния треков (на случай прямых изменений)
let trackCheckInterval: ReturnType<typeof setInterval> | null = null;
watch(
  () => props.localStream,
  (stream) => {
    if (trackCheckInterval) {
      clearInterval(trackCheckInterval);
      trackCheckInterval = null;
    }

    if (stream) {
      // Проверяем состояние треков каждые 500мс
      trackCheckInterval = setInterval(() => {
        trackUpdateTrigger.value++;
      }, 500);
    }
  },
  { immediate: true }
);

const setRemoteVideoRef = (el: any, peerId: string) => {
  if (el) {
    remoteVideoRefs.value.set(peerId, el);
  }
};

const getParticipantName = (peerId: string): string => {
  const participant = props.participants.find((p) => p.peerId === peerId);
  return participant?.userName || `Пользователь ${peerId.slice(0, 6)}`;
};

// Обработчики переключения камеры и микрофона
const handleToggleAudio = () => {
  if (props.onToggleAudio) {
    props.onToggleAudio(!hasActiveAudioTracks.value);
  }
};

const handleToggleVideo = () => {
  if (props.onToggleVideo) {
    props.onToggleVideo(!hasActiveVideoTracks.value);
  }
};

// Функция для установки локального потока с retry механизмом
const setLocalStream = async () => {
  // Используем nextTick для гарантии готовности DOM
  await nextTick();

  if (!localVideoRef.value) {
    console.log("[VideoGrid] Видео элемент еще не готов");
    return;
  }

  if (props.localStream) {
    const videoTracks = props.localStream.getVideoTracks();
    const audioTracks = props.localStream.getAudioTracks();

    const currentSrcObjectId =
      localVideoRef.value.srcObject instanceof MediaStream
        ? localVideoRef.value.srcObject.id
        : "null";

    console.log("[VideoGrid] Установка локального потока:", {
      streamId: props.localStream.id,
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length,
      videoElementReady: !!localVideoRef.value,
      currentSrcObject: currentSrcObjectId,
    });

    // Проверяем наличие видео треков перед установкой
    if (videoTracks.length === 0) {
      console.warn("[VideoGrid] Нет видео треков в потоке");
      return;
    }

    // Проверяем состояние треков
    videoTracks.forEach((track, index) => {
      console.log(`[VideoGrid] Видео трек ${index}:`, {
        id: track.id,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
      });
    });

    // Проверяем, не установлен ли уже этот поток
    if (localVideoRef.value.srcObject === props.localStream) {
      console.log(
        "[VideoGrid] Поток уже установлен, проверяем воспроизведение"
      );
      // Проверяем, что видео воспроизводится
      if (localVideoRef.value.paused) {
        console.log("[VideoGrid] Видео приостановлено, возобновляем");
        try {
          await localVideoRef.value.play();
          console.log("[VideoGrid] Видео успешно возобновлено");
        } catch (err) {
          console.error("[VideoGrid] Ошибка возобновления видео:", err);
        }
      } else {
        console.log("[VideoGrid] Видео уже воспроизводится");
      }
      return;
    }

    // Устанавливаем поток
    console.log("[VideoGrid] Устанавливаем srcObject");
    localVideoRef.value.srcObject = props.localStream;

    // Проверяем, что поток установлен
    if (localVideoRef.value.srcObject !== props.localStream) {
      console.error("[VideoGrid] ОШИБКА: srcObject не установлен!");
      return;
    }

    // Функция для попытки воспроизведения с retry
    const tryPlay = async (retries = 5): Promise<void> => {
      try {
        console.log(
          `[VideoGrid] Попытка воспроизведения (${6 - retries}/5)...`
        );
        await localVideoRef.value!.play();
        console.log("[VideoGrid] ✅ Локальное видео успешно запущено!");
        console.log("[VideoGrid] Состояние видео элемента:", {
          paused: localVideoRef.value!.paused,
          muted: localVideoRef.value!.muted,
          readyState: localVideoRef.value!.readyState,
          videoWidth: localVideoRef.value!.videoWidth,
          videoHeight: localVideoRef.value!.videoHeight,
        });
      } catch (err: any) {
        console.error(
          `[VideoGrid] Ошибка воспроизведения локального видео (попытка ${
            6 - retries
          }/5):`,
          {
            name: err.name,
            message: err.message,
            paused: localVideoRef.value!.paused,
            readyState: localVideoRef.value!.readyState,
          }
        );

        if (retries > 0 && err.name !== "NotAllowedError") {
          // Повторяем попытку через небольшую задержку
          await new Promise((resolve) => setTimeout(resolve, 200));
          return tryPlay(retries - 1);
        } else {
          console.error(
            "[VideoGrid] ❌ Не удалось запустить видео после всех попыток"
          );
        }
      }
    };

    // Пытаемся запустить видео
    await tryPlay();
  } else {
    console.log("[VideoGrid] Локальный поток отсутствует, очищаем");
    if (localVideoRef.value.srcObject) {
      localVideoRef.value.srcObject = null;
    }
  }
};

// Привязка локального потока к видео элементу
watch(
  () => props.localStream,
  async (stream, oldStream) => {
    console.log("[VideoGrid] Изменение localStream:", {
      new: stream?.id || "null",
      old: oldStream?.id || "null",
      hasVideoTracks: stream?.getVideoTracks().length || 0,
      hasAudioTracks: stream?.getAudioTracks().length || 0,
    });
    await setLocalStream();
  },
  { immediate: true }
);

// Также отслеживаем изменения через nextTick для гарантии, что элемент готов
watch(
  () => localVideoRef.value,
  async (newRef) => {
    if (newRef && props.localStream) {
      console.log("[VideoGrid] Видео элемент готов, устанавливаем поток");
      await setLocalStream();
    }
  },
  { immediate: true }
);

// Привязка удаленных потоков к видео элементам
watch(
  () => props.remoteStreams,
  async (streams) => {
    await nextTick();
    if (!streams || !(streams instanceof Map)) {
      console.warn("[VideoGrid] remoteStreams не является Map или undefined");
      return;
    }
    streams.forEach((remoteStream, peerId) => {
      const videoElement = remoteVideoRefs.value.get(peerId);
      if (videoElement && remoteStream.stream) {
        const videoTracks = remoteStream.stream.getVideoTracks();
        if (videoTracks.length > 0) {
          // Проверяем, не установлен ли уже этот поток
          if (videoElement.srcObject !== remoteStream.stream) {
            videoElement.srcObject = remoteStream.stream;
            videoElement.play().catch((err) => {
              console.error(
                `[VideoGrid] Ошибка воспроизведения видео от ${peerId}:`,
                err
              );
            });
          } else if (videoElement.paused) {
            // Если поток уже установлен, но видео приостановлено, возобновляем
            videoElement.play().catch((err) => {
              console.error(
                `[VideoGrid] Ошибка возобновления видео от ${peerId}:`,
                err
              );
            });
          }
        }
      }
    });
  },
  { deep: true, immediate: true }
);

onMounted(async () => {
  // Используем nextTick для гарантии готовности DOM
  await nextTick();

  // Принудительно устанавливаем поток при монтировании
  if (props.localStream) {
    console.log("[VideoGrid] onMounted: устанавливаем локальный поток");
    await setLocalStream();
  }

  // Также привязываем удаленные потоки
  if (props.remoteStreams && props.remoteStreams instanceof Map) {
    props.remoteStreams.forEach((remoteStream, peerId) => {
      const videoElement = remoteVideoRefs.value.get(peerId);
      if (videoElement && remoteStream.stream) {
        const videoTracks = remoteStream.stream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoElement.srcObject = remoteStream.stream;
          videoElement.play().catch((err) => {
            console.error(
              `[VideoGrid] Ошибка воспроизведения видео от ${peerId} в onMounted:`,
              err
            );
          });
        }
      }
    });
  }
});

onUnmounted(() => {
  // Очистка ссылок на видео элементы
  remoteVideoRefs.value.clear();

  // Очистка интервала проверки треков
  if (trackCheckInterval) {
    clearInterval(trackCheckInterval);
    trackCheckInterval = null;
  }
});
</script>
