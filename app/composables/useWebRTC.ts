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
  // Буфер для ICE кандидатов, которые приходят до создания соединения
  const pendingIceCandidates = ref<Map<string, WebRTCIceCandidate[]>>(
    new Map()
  );
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
    // Согласно примерам Google WebRTC: https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/pc1/js/main.js
    peerConnection.ontrack = (event) => {
      console.log("[WebRTC] Получен удаленный трек от", targetPeerId, {
        track: event.track,
        trackKind: event.track.kind,
        streams: event.streams.length,
        trackId: event.track.id,
      });

      // Получаем поток из события или создаем новый, если потока нет
      // В некоторых случаях event.streams может быть пустым, поэтому создаем поток из трека
      let stream = event.streams[0];

      if (!stream) {
        // Если потока нет в событии, создаем новый поток из трека
        console.log(
          "[WebRTC] Поток отсутствует в событии, создаем новый из трека"
        );
        stream = new MediaStream([event.track]);
      }

      // Проверяем, существует ли уже удаленный поток для этого участника
      let remoteStream = remoteStreams.value.get(targetPeerId);

      if (!remoteStream) {
        // Создаем новый RemoteStream если его еще нет
        remoteStream = {
          peerId: targetPeerId,
          stream: new MediaStream(),
          audioEnabled: false,
          videoEnabled: false,
        };
        remoteStreams.value.set(targetPeerId, remoteStream);
        console.log("[WebRTC] Создан новый RemoteStream для", targetPeerId);
      }

      // Добавляем трек в поток (если его там еще нет)
      const existingTrack = remoteStream.stream
        .getTracks()
        .find((t) => t.id === event.track.id);

      if (!existingTrack) {
        remoteStream.stream.addTrack(event.track);
        console.log("[WebRTC] Трек добавлен в поток:", {
          trackId: event.track.id,
          trackKind: event.track.kind,
          enabled: event.track.enabled,
        });
      } else {
        console.log(
          "[WebRTC] Трек уже существует в потоке, пропускаем:",
          event.track.id
        );
        return;
      }

      // Обновляем состояние треков после добавления
      const audioTracks = remoteStream.stream.getAudioTracks();
      const videoTracks = remoteStream.stream.getVideoTracks();
      remoteStream.audioEnabled =
        audioTracks.length > 0 && audioTracks.some((t) => t.enabled);
      remoteStream.videoEnabled =
        videoTracks.length > 0 && videoTracks.some((t) => t.enabled);

      // Отслеживаем изменения состояния треков
      event.track.onended = () => {
        console.log(
          "[WebRTC] Трек завершен:",
          event.track.id,
          event.track.kind
        );
        const rs = remoteStreams.value.get(targetPeerId);
        if (rs) {
          if (event.track.kind === "audio") {
            rs.audioEnabled = false;
          } else if (event.track.kind === "video") {
            rs.videoEnabled = false;
          }
          // Триггерим реактивность Vue, создавая новую Map
          remoteStreams.value = new Map(remoteStreams.value);
        }
      };

      event.track.onmute = () => {
        console.log(
          "[WebRTC] Трек приглушен:",
          event.track.id,
          event.track.kind
        );
        const rs = remoteStreams.value.get(targetPeerId);
        if (rs) {
          if (event.track.kind === "audio") {
            rs.audioEnabled = false;
          } else if (event.track.kind === "video") {
            rs.videoEnabled = false;
          }
          // Триггерим реактивность Vue
          remoteStreams.value = new Map(remoteStreams.value);
        }
      };

      event.track.onunmute = () => {
        console.log("[WebRTC] Трек включен:", event.track.id, event.track.kind);
        const rs = remoteStreams.value.get(targetPeerId);
        if (rs) {
          if (event.track.kind === "audio") {
            rs.audioEnabled = true;
          } else if (event.track.kind === "video") {
            rs.videoEnabled = true;
          }
          // Триггерим реактивность Vue
          remoteStreams.value = new Map(remoteStreams.value);
        }
      };

      // Триггерим реактивность Vue после обновления
      remoteStreams.value = new Map(remoteStreams.value);

      console.log("[WebRTC] ✅ Удаленный поток обновлен:", {
        peerId: targetPeerId,
        audioTracks: audioTracks.length,
        videoTracks: videoTracks.length,
        totalTracks: remoteStream.stream.getTracks().length,
        audioEnabled: remoteStream.audioEnabled,
        videoEnabled: remoteStream.videoEnabled,
        streamId: remoteStream.stream.id,
      });
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
        console.log(`[WebRTC] Отправка ICE candidate для ${targetPeerId}:`, {
          candidate: candidate.candidate?.substring(0, 50) + "...",
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
        });
        sendIceCandidate(candidate, targetPeerId, roomId);
      } else {
        // null кандидат означает завершение ICE gathering
        console.log(
          `[WebRTC] ICE candidate gathering завершен для ${targetPeerId}`
        );
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

  // Вспомогательная функция для обработки отложенных ICE кандидатов
  const processPendingIceCandidates = async (
    peerConnection: RTCPeerConnection,
    peerId: string
  ) => {
    const pendingCandidates = pendingIceCandidates.value.get(peerId);
    if (!pendingCandidates || pendingCandidates.length === 0) {
      return;
    }

    console.log(
      `[WebRTC] Обрабатываем ${pendingCandidates.length} отложенных ICE кандидатов для ${peerId}`
    );

    const currentState = peerConnection.signalingState;
    const hasRemoteDescription = !!peerConnection.remoteDescription;

    // Обрабатываем кандидаты только если соединение готово
    if (
      currentState === "have-remote-offer" ||
      currentState === "have-local-pranswer" ||
      currentState === "have-remote-pranswer" ||
      currentState === "stable" ||
      (currentState === "have-local-offer" && hasRemoteDescription)
    ) {
      for (const candidate of pendingCandidates) {
        try {
          // Валидация кандидата
          if (!candidate.candidate || candidate.candidate.trim() === "") {
            continue; // Пропускаем пустые кандидаты
          }

          const iceCandidateInit: RTCIceCandidateInit = {};

          if (candidate.candidate) {
            iceCandidateInit.candidate = candidate.candidate;
          }

          if (
            candidate.sdpMLineIndex !== null &&
            candidate.sdpMLineIndex !== undefined
          ) {
            iceCandidateInit.sdpMLineIndex = candidate.sdpMLineIndex;
          }

          if (candidate.sdpMid) {
            iceCandidateInit.sdpMid = candidate.sdpMid;
          }

          if (candidate.usernameFragment) {
            iceCandidateInit.usernameFragment = candidate.usernameFragment;
          }

          // Проверяем, что у нас есть хотя бы candidate или sdpMid
          if (!iceCandidateInit.candidate && !iceCandidateInit.sdpMid) {
            console.warn(
              `[WebRTC] Некорректный отложенный ICE candidate от ${peerId}: нет candidate и sdpMid`
            );
            continue;
          }

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(iceCandidateInit)
          );
          console.log(
            `[WebRTC] ✅ Отложенный ICE candidate успешно добавлен для ${peerId}`
          );
        } catch (candidateError: any) {
          const errorName = candidateError?.name || "Unknown";
          // OperationError и InvalidStateError не критичны
          if (
            errorName === "OperationError" ||
            errorName === "InvalidStateError"
          ) {
            console.warn(
              `[WebRTC] ⚠️ Не удалось добавить отложенный ICE candidate от ${peerId}:`,
              errorName
            );
          } else {
            console.error(
              `[WebRTC] ❌ Ошибка добавления отложенного ICE candidate от ${peerId}:`,
              candidateError
            );
          }
        }
      }
      pendingIceCandidates.value.delete(peerId);
    } else {
      console.log(
        `[WebRTC] Соединение с ${peerId} еще не готово для обработки отложенных кандидатов (${currentState})`
      );
    }
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

    // Если соединение уже существует, закрываем его и создаем новое
    if (peerConnection) {
      console.warn(
        `[WebRTC] Соединение с ${senderPeerId} уже существует, закрываем и создаем новое`
      );
      peerConnection.close();
      connections.value.delete(senderPeerId);
      remoteStreams.value.delete(senderPeerId);
    }

    peerConnection = createPeerConnection(senderPeerId);

    try {
      // Устанавливаем remote description
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

      console.log(`[WebRTC] Answer создан и отправлен для ${senderPeerId}`);

      // Обрабатываем отложенные ICE кандидаты после установки local description
      await processPendingIceCandidates(peerConnection, senderPeerId);
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
      // Проверяем состояние соединения перед установкой remote description
      const currentState = peerConnection.signalingState;
      console.log(
        `[WebRTC] Текущее состояние соединения с ${senderPeerId}:`,
        currentState
      );

      // Answer можно установить только если мы в состоянии "have-local-offer"
      if (currentState === "have-local-offer") {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        console.log(`[WebRTC] Answer успешно установлен для ${senderPeerId}`);

        // Обрабатываем отложенные ICE кандидаты
        await processPendingIceCandidates(peerConnection, senderPeerId);
      } else if (currentState === "stable") {
        // Если соединение уже в stable, значит answer уже был установлен
        // Это может быть нормально, если answer пришел дважды
        console.warn(
          `[WebRTC] Попытка установить answer в состоянии "stable" для ${senderPeerId}. Возможно, answer уже был установлен.`
        );
      } else {
        console.error(
          `[WebRTC] Невозможно установить answer в состоянии "${currentState}" для ${senderPeerId}`
        );
      }
    } catch (error) {
      console.error(
        `[WebRTC] Ошибка обработки answer от ${senderPeerId}:`,
        error
      );
      // Не закрываем соединение при ошибке, так как это может быть временная проблема
    }
  };

  // Обработка полученного ICE кандидата
  // Согласно примерам Google WebRTC: https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/pc1/js/main.js
  const handleIceCandidate = async (
    candidate: WebRTCIceCandidate,
    senderPeerId: string
  ) => {
    const peerConnection = connections.value.get(senderPeerId);

    if (!peerConnection) {
      // Если соединение еще не создано, сохраняем кандидата в буфер
      console.log(
        `[WebRTC] Соединение с ${senderPeerId} еще не создано, сохраняем ICE candidate в буфер`
      );
      if (!pendingIceCandidates.value.has(senderPeerId)) {
        pendingIceCandidates.value.set(senderPeerId, []);
      }
      pendingIceCandidates.value.get(senderPeerId)!.push(candidate);
      return;
    }

    try {
      // Проверяем состояние соединения
      const currentState = peerConnection.signalingState;
      const hasRemoteDescription = !!peerConnection.remoteDescription;

      // Валидация кандидата
      if (!candidate.candidate || candidate.candidate.trim() === "") {
        console.log(
          `[WebRTC] Пустой ICE candidate от ${senderPeerId}, это нормально (завершение ICE gathering)`
        );
        // Пустой кандидат означает завершение ICE gathering - это нормально
        return;
      }

      // ICE кандидаты можно добавлять только если remote description установлен
      // Согласно спецификации WebRTC, кандидаты можно добавлять в состояниях:
      // - "have-remote-offer" (после установки remote offer)
      // - "have-local-pranswer" (после установки remote offer и local pranswer)
      // - "have-remote-pranswer" (после установки local offer и remote pranswer)
      // - "stable" (после установки обоих descriptions)
      if (
        currentState === "have-remote-offer" ||
        currentState === "have-local-pranswer" ||
        currentState === "have-remote-pranswer" ||
        currentState === "stable" ||
        (currentState === "have-local-offer" && hasRemoteDescription)
      ) {
        // Создаем объект кандидата с валидацией
        const iceCandidateInit: RTCIceCandidateInit = {};

        if (candidate.candidate) {
          iceCandidateInit.candidate = candidate.candidate;
        }

        if (
          candidate.sdpMLineIndex !== null &&
          candidate.sdpMLineIndex !== undefined
        ) {
          iceCandidateInit.sdpMLineIndex = candidate.sdpMLineIndex;
        }

        if (candidate.sdpMid) {
          iceCandidateInit.sdpMid = candidate.sdpMid;
        }

        if (candidate.usernameFragment) {
          iceCandidateInit.usernameFragment = candidate.usernameFragment;
        }

        // Проверяем, что у нас есть хотя бы candidate или sdpMid
        if (!iceCandidateInit.candidate && !iceCandidateInit.sdpMid) {
          console.warn(
            `[WebRTC] Некорректный ICE candidate от ${senderPeerId}: нет candidate и sdpMid`
          );
          return;
        }

        await peerConnection.addIceCandidate(
          new RTCIceCandidate(iceCandidateInit)
        );
        console.log(
          `[WebRTC] ✅ ICE candidate успешно добавлен для ${senderPeerId}`,
          {
            candidate: candidate.candidate?.substring(0, 50) + "...",
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid,
            state: currentState,
          }
        );
      } else {
        // Сохраняем в буфер, если соединение еще не готово
        console.log(
          `[WebRTC] Соединение с ${senderPeerId} не готово (${currentState}, hasRemoteDescription: ${hasRemoteDescription}), сохраняем ICE candidate в буфер`
        );
        if (!pendingIceCandidates.value.has(senderPeerId)) {
          pendingIceCandidates.value.set(senderPeerId, []);
        }
        pendingIceCandidates.value.get(senderPeerId)!.push(candidate);
      }
    } catch (error: any) {
      // Некоторые ошибки ICE кандидатов не критичны и могут быть проигнорированы
      const errorName = error?.name || "Unknown";
      const errorMessage = error?.message || String(error);

      // OperationError обычно означает, что кандидат уже был добавлен или невалиден
      // Это не критично, так как браузер может автоматически фильтровать дубликаты
      if (errorName === "OperationError" || errorName === "InvalidStateError") {
        console.warn(
          `[WebRTC] ⚠️ Не удалось добавить ICE candidate от ${senderPeerId}:`,
          {
            error: errorName,
            message: errorMessage,
            candidate: candidate.candidate?.substring(0, 50) + "...",
            state: peerConnection?.signalingState,
          }
        );
        // Не критично, продолжаем работу
      } else {
        console.error(
          `[WebRTC] ❌ Ошибка добавления ICE candidate от ${senderPeerId}:`,
          {
            error: errorName,
            message: errorMessage,
            candidate: candidate.candidate?.substring(0, 50) + "...",
            state: peerConnection?.signalingState,
            stack: error?.stack,
          }
        );
      }
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
    // Очищаем буфер отложенных ICE кандидатов
    pendingIceCandidates.value.delete(targetPeerId);
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
      // Триггерим реактивность Vue
      remoteStreams.value = new Map(remoteStreams.value);
      console.log("[WebRTC] Состояние медиа обновлено для", peerId, {
        audioEnabled,
        videoEnabled,
      });
    }
  };

  // Закрытие всех соединений
  const closeAllConnections = () => {
    connections.value.forEach((peerConnection, targetPeerId) => {
      peerConnection.close();
    });
    connections.value.clear();
    remoteStreams.value.clear();
    // Очищаем все буферы отложенных ICE кандидатов
    pendingIceCandidates.value.clear();
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
