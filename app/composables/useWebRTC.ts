import { ref, onUnmounted } from "vue";
import type {
  WebRTCSessionDescription,
  WebRTCIceCandidate,
} from "./useWebSocket";

export interface RemoteStream {
  peerId: string;
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

export const useWebRTC = (
  sendWebRTCOffer: (
    offer: WebRTCSessionDescription,
    targetPeerId: string,
    roomId: string
  ) => boolean,
  sendWebRTCAnswer: (
    answer: WebRTCSessionDescription,
    targetPeerId: string,
    roomId: string
  ) => boolean,
  sendIceCandidate: (
    candidate: WebRTCIceCandidate,
    targetPeerId: string,
    roomId: string
  ) => boolean,
  peerId: string,
  roomId: string
) => {
  const localStream = ref<MediaStream | null>(null);
  const remoteStreams = ref<Map<string, RemoteStream>>(new Map());
  const connections = ref<Map<string, RTCPeerConnection>>(new Map());
  // Начальное состояние false, пока не получим реальный поток
  const audioEnabled = ref(false);
  const videoEnabled = ref(false);

  // Конфигурация STUN серверов для NAT traversal
  const rtcConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Функция обновления состояния медиа на основе реальных треков
  const updateMediaState = () => {
    if (localStream.value) {
      const audioTracks = localStream.value.getAudioTracks();
      const videoTracks = localStream.value.getVideoTracks();

      // Проверяем все треки, а не только первый
      // Аудио включено если есть хотя бы один enabled трек (не проверяем readyState, так как треки могут быть в процессе инициализации)
      const hasActiveAudio =
        audioTracks.length > 0 && audioTracks.some((track) => track.enabled);

      // Видео включено если есть хотя бы один enabled трек
      const hasActiveVideo =
        videoTracks.length > 0 && videoTracks.some((track) => track.enabled);

      // Обновляем состояние только если оно изменилось
      if (audioEnabled.value !== hasActiveAudio) {
        audioEnabled.value = hasActiveAudio;
        console.log(
          `[WebRTC] audioEnabled обновлен: ${hasActiveAudio} (треков: ${audioTracks.length})`
        );
      }
      if (videoEnabled.value !== hasActiveVideo) {
        videoEnabled.value = hasActiveVideo;
        console.log(
          `[WebRTC] videoEnabled обновлен: ${hasActiveVideo} (треков: ${videoTracks.length})`
        );
      }

      console.log("[WebRTC] Состояние медиа обновлено:", {
        audioEnabled: audioEnabled.value,
        videoEnabled: videoEnabled.value,
        audioTracks: audioTracks.length,
        videoTracks: videoTracks.length,
        audioTracksEnabled: audioTracks.filter((t) => t.enabled).length,
        videoTracksEnabled: videoTracks.filter((t) => t.enabled).length,
      });
    } else {
      // Если потока нет, сбрасываем состояние
      if (audioEnabled.value !== false) {
        audioEnabled.value = false;
        console.log("[WebRTC] audioEnabled сброшен в false (нет потока)");
      }
      if (videoEnabled.value !== false) {
        videoEnabled.value = false;
        console.log("[WebRTC] videoEnabled сброшен в false (нет потока)");
      }
    }
  };

  // Инициализация локального медиа потока
  const initializeLocalStream = async () => {
    try {
      // Проверяем доступность API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "getUserMedia не поддерживается в этом браузере. Используйте HTTPS или localhost."
        );
      }

      // Проверяем разрешения перед запросом (если доступно)
      let hasPermissions = false;
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const audioPermission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          const cameraPermission = await navigator.permissions.query({
            name: "camera" as PermissionName,
          });
          hasPermissions =
            audioPermission.state !== "denied" &&
            cameraPermission.state !== "denied";
          console.log("[WebRTC] Состояние разрешений:", {
            audio: audioPermission.state,
            camera: cameraPermission.state,
          });
        }
      } catch (permError) {
        // Игнорируем ошибки проверки разрешений, не все браузеры поддерживают
        console.log("[WebRTC] Не удалось проверить разрешения:", permError);
      }

      console.log("[WebRTC] Запрос доступа к медиа устройствам...");

      let stream: MediaStream;
      try {
        // Пытаемся получить доступ к обоим устройствам одновременно
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch (initialError: any) {
        console.warn(
          "[WebRTC] Не удалось получить доступ к обоим устройствам, пробуем по отдельности:",
          initialError
        );

        // Если не получилось получить оба, пробуем получить по отдельности
        const streams: MediaStream[] = [];

        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          streams.push(audioStream);
          console.log("[WebRTC] Аудио доступ получен");
        } catch (audioError) {
          console.warn(
            "[WebRTC] Не удалось получить доступ к аудио:",
            audioError
          );
        }

        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
          streams.push(videoStream);
          console.log("[WebRTC] Видео доступ получен");
        } catch (videoError) {
          console.warn(
            "[WebRTC] Не удалось получить доступ к видео:",
            videoError
          );
        }

        if (streams.length === 0) {
          // Если ничего не получилось, пробрасываем первоначальную ошибку
          throw initialError;
        }

        // Объединяем потоки
        stream = new MediaStream();
        streams.forEach((s) => {
          s.getTracks().forEach((track) => {
            stream.addTrack(track);
          });
        });

        console.log("[WebRTC] Потоки объединены:", {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
        });
      }

      console.log("[WebRTC] Доступ к медиа устройствам получен:", {
        streamId: stream.id,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });

      // Логируем состояние каждого трека
      stream.getAudioTracks().forEach((track, index) => {
        console.log(`[WebRTC] Аудио трек ${index}:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          label: track.label,
        });
      });
      stream.getVideoTracks().forEach((track, index) => {
        console.log(`[WebRTC] Видео трек ${index}:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          label: track.label,
        });
      });

      localStream.value = stream;

      // Устанавливаем начальное состояние на основе реальных треков
      updateMediaState();

      // Добавляем слушатели изменений состояния треков
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          console.log("[WebRTC] Аудио трек завершен");
          updateMediaState();
        };
        track.onmute = () => {
          console.log("[WebRTC] Аудио трек приглушен");
          updateMediaState();
        };
        track.onunmute = () => {
          console.log("[WebRTC] Аудио трек включен");
          updateMediaState();
        };
      });

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.log("[WebRTC] Видео трек завершен");
          updateMediaState();
        };
        track.onmute = () => {
          console.log("[WebRTC] Видео трек приглушен");
          updateMediaState();
        };
        track.onunmute = () => {
          console.log("[WebRTC] Видео трек включен");
          updateMediaState();
        };
      });

      // Также отслеживаем изменения enabled напрямую через периодическую проверку
      // Используем setInterval для периодической проверки (как fallback)
      let checkInterval: ReturnType<typeof setInterval> | null = null;
      checkInterval = setInterval(() => {
        if (!localStream.value) {
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
          return;
        }
        updateMediaState();
      }, 1000); // Проверяем состояние каждую секунду

      console.log("[WebRTC] ✅ Локальный поток успешно инициализирован!", {
        audioEnabled: audioEnabled.value,
        videoEnabled: videoEnabled.value,
      });

      return stream;
    } catch (error: any) {
      console.error("[WebRTC] Ошибка получения локального потока:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });

      // Дополнительная информация об ошибке
      if (error.name === "NotAllowedError") {
        console.error(
          "[WebRTC] Пользователь отклонил запрос на доступ к медиа устройствам"
        );
      } else if (error.name === "NotFoundError") {
        console.error("[WebRTC] Медиа устройства не найдены");
      } else if (error.name === "NotReadableError") {
        console.error(
          "[WebRTC] Медиа устройства недоступны (возможно, используются другим приложением)"
        );
      }

      throw error;
    }
  };

  // Создание RTCPeerConnection для нового участника
  const createPeerConnection = (targetPeerId: string): RTCPeerConnection => {
    const peerConnection = new RTCPeerConnection(rtcConfiguration);

    // Добавляем локальные треки в соединение
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream.value!);
      });
    }

    // Обработка получения удаленных треков
    peerConnection.ontrack = (event) => {
      console.log("[WebRTC] Получен удаленный трек от", targetPeerId);
      const stream = event.streams[0];
      if (stream) {
        const remoteStream: RemoteStream = {
          peerId: targetPeerId,
          stream,
          audioEnabled: true,
          videoEnabled: true,
        };
        remoteStreams.value.set(targetPeerId, remoteStream);
      }
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate: WebRTCIceCandidate = {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
          usernameFragment: event.candidate.usernameFragment || null,
        };
        sendIceCandidate(candidate, targetPeerId, roomId);
      }
    };

    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
      console.log(
        `[WebRTC] Состояние соединения с ${targetPeerId}:`,
        peerConnection.connectionState
      );
      if (
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "disconnected"
      ) {
        closePeerConnection(targetPeerId);
      }
    };

    connections.value.set(targetPeerId, peerConnection);
    return peerConnection;
  };

  // Инициализация соединения (создание offer)
  const initiateConnection = async (targetPeerId: string) => {
    if (connections.value.has(targetPeerId)) {
      console.warn(`[WebRTC] Соединение с ${targetPeerId} уже существует`);
      return;
    }

    const peerConnection = createPeerConnection(targetPeerId);

    try {
      // Создаем offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      // Отправляем offer через WebSocket
      const webRTCOffer: WebRTCSessionDescription = {
        type: "offer",
        sdp: offer.sdp || "",
      };
      sendWebRTCOffer(webRTCOffer, targetPeerId, roomId);
    } catch (error) {
      console.error(
        `[WebRTC] Ошибка создания offer для ${targetPeerId}:`,
        error
      );
      closePeerConnection(targetPeerId);
    }
  };

  // Обработка полученного offer
  const handleOffer = async (
    offer: WebRTCSessionDescription,
    senderPeerId: string
  ) => {
    let peerConnection = connections.value.get(senderPeerId);

    if (!peerConnection) {
      peerConnection = createPeerConnection(senderPeerId);
    }

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      // Создаем answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Отправляем answer через WebSocket
      const webRTCAnswer: WebRTCSessionDescription = {
        type: "answer",
        sdp: answer.sdp || "",
      };
      sendWebRTCAnswer(webRTCAnswer, senderPeerId, roomId);
    } catch (error) {
      console.error(
        `[WebRTC] Ошибка обработки offer от ${senderPeerId}:`,
        error
      );
      closePeerConnection(senderPeerId);
    }
  };

  // Обработка полученного answer
  const handleAnswer = async (
    answer: WebRTCSessionDescription,
    senderPeerId: string
  ) => {
    const peerConnection = connections.value.get(senderPeerId);

    if (!peerConnection) {
      console.warn(
        `[WebRTC] Соединение с ${senderPeerId} не найдено для answer`
      );
      return;
    }

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    } catch (error) {
      console.error(
        `[WebRTC] Ошибка обработки answer от ${senderPeerId}:`,
        error
      );
      closePeerConnection(senderPeerId);
    }
  };

  // Обработка полученного ICE кандидата
  const handleIceCandidate = async (
    candidate: WebRTCIceCandidate,
    senderPeerId: string
  ) => {
    const peerConnection = connections.value.get(senderPeerId);

    if (!peerConnection) {
      console.warn(
        `[WebRTC] Соединение с ${senderPeerId} не найдено для ICE candidate`
      );
      return;
    }

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate({
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
          usernameFragment: candidate.usernameFragment || undefined,
        })
      );
    } catch (error) {
      console.error(
        `[WebRTC] Ошибка добавления ICE candidate от ${senderPeerId}:`,
        error
      );
    }
  };

  // Закрытие соединения с участником
  const closePeerConnection = (targetPeerId: string) => {
    const peerConnection = connections.value.get(targetPeerId);
    if (peerConnection) {
      peerConnection.close();
      connections.value.delete(targetPeerId);
    }
    remoteStreams.value.delete(targetPeerId);
  };

  // Переключение аудио
  const toggleAudio = (enabled: boolean) => {
    console.log(`[WebRTC] toggleAudio вызван с enabled=${enabled}`);

    if (localStream.value) {
      const audioTracks = localStream.value.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn("[WebRTC] Нет аудио треков для переключения");
        return;
      }

      audioTracks.forEach((track) => {
        track.enabled = enabled;
        console.log(`[WebRTC] Аудио трек ${track.id} установлен в ${enabled}`);
      });

      // Немедленно обновляем состояние
      audioEnabled.value = enabled;
      console.log(`[WebRTC] audioEnabled немедленно установлен в ${enabled}`);

      // Также вызываем updateMediaState для полной синхронизации
      setTimeout(() => {
        updateMediaState();
      }, 10);
    } else {
      console.warn(
        "[WebRTC] Локальный поток не инициализирован для toggleAudio"
      );
    }
  };

  // Переключение видео
  const toggleVideo = (enabled: boolean) => {
    console.log(`[WebRTC] toggleVideo вызван с enabled=${enabled}`);

    if (localStream.value) {
      const videoTracks = localStream.value.getVideoTracks();
      if (videoTracks.length === 0) {
        console.warn("[WebRTC] Нет видео треков для переключения");
        return;
      }

      videoTracks.forEach((track) => {
        track.enabled = enabled;
        console.log(`[WebRTC] Видео трек ${track.id} установлен в ${enabled}`);
      });

      // Немедленно обновляем состояние
      videoEnabled.value = enabled;
      console.log(`[WebRTC] videoEnabled немедленно установлен в ${enabled}`);

      // Также вызываем updateMediaState для полной синхронизации
      setTimeout(() => {
        updateMediaState();
      }, 10);
    } else {
      console.warn(
        "[WebRTC] Локальный поток не инициализирован для toggleVideo"
      );
    }
  };

  // Установка состояния медиа для удаленного участника
  const setRemoteMediaState = (
    peerId: string,
    audioEnabled: boolean,
    videoEnabled: boolean
  ) => {
    const remoteStream = remoteStreams.value.get(peerId);
    if (remoteStream) {
      remoteStream.audioEnabled = audioEnabled;
      remoteStream.videoEnabled = videoEnabled;
    }
  };

  // Закрытие всех соединений
  const closeAllConnections = () => {
    connections.value.forEach((peerConnection, targetPeerId) => {
      peerConnection.close();
    });
    connections.value.clear();
    remoteStreams.value.clear();
  };

  // Остановка локального потока
  const stopLocalStream = () => {
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        track.stop();
      });
      localStream.value = null;
    }
  };

  // Очистка при размонтировании
  onUnmounted(() => {
    closeAllConnections();
    stopLocalStream();
  });

  return {
    localStream,
    remoteStreams,
    connections,
    audioEnabled,
    videoEnabled,
    initializeLocalStream,
    initiateConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeerConnection,
    toggleAudio,
    toggleVideo,
    setRemoteMediaState,
    closeAllConnections,
    stopLocalStream,
  };
};
