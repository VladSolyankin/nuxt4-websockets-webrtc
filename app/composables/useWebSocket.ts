import { ref, onMounted, onUnmounted } from "vue";

export interface WebSocketMessage {
  type: string;
  status?: string;
  peerId?: string;
  payload?: any;
  timestamp?: number;
}

export interface Participant {
  userId: string;
  userName?: string;
  peerId: string;
}

export interface Room {
  id: string;
  participantsCount: number;
}

export interface RoomInfo {
  roomId: string;
  participants: Participant[];
}

// Интерфейсы для WebRTC signaling данных
export interface WebRTCSessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface WebRTCIceCandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment?: string | null;
}

// Интерфейсы для чата
export interface ChatMessage {
  id: string;
  roomId: string;
  peerId: string;
  userName: string;
  text: string;
  timestamp: number;
  reactions?: ChatReaction[];
  rating?: ChatRating;
}

export interface ChatFileMessage {
  id: string;
  roomId: string;
  peerId: string;
  userName: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string; // base64
  timestamp: number;
  reactions?: ChatReaction[];
  rating?: ChatRating;
}

export interface ChatReaction {
  messageId: string;
  peerId: string;
  userName: string;
  emoji: string;
  timestamp: number;
}

export interface ChatRating {
  messageId: string;
  likes: number;
  dislikes: number;
  userRating?: "like" | "dislike" | null; // Рейтинг текущего пользователя
}

export const useWebSocket = () => {
  const ws = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const peerId = ref<string | null>(null);
  const connectionStatus = ref<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  // Состояния для комнат
  const currentRoomId = ref<string | null>(null);
  const rooms = ref<Room[]>([]);
  const participants = ref<Participant[]>([]);
  const participantsCount = ref(0);

  // Callbacks для обработки событий
  const onRoomParticipants = ref<((roomInfo: RoomInfo) => void) | null>(null);
  const onUserJoined = ref<((participant: Participant) => void) | null>(null);
  const onUserLeft = ref<((participant: Participant) => void) | null>(null);
  const onRoomUpdated = ref<((roomId: string, count: number) => void) | null>(
    null
  );
  const onRoomsList = ref<((rooms: Room[]) => void) | null>(null);
  const onUserAudioToggled = ref<
    ((peerId: string, enabled: boolean) => void) | null
  >(null);
  const onUserVideoToggled = ref<
    ((peerId: string, enabled: boolean) => void) | null
  >(null);
  const onWebRTCOffer = ref<
    ((offer: WebRTCSessionDescription, senderPeerId: string) => void) | null
  >(null);
  const onWebRTCAnswer = ref<
    ((answer: WebRTCSessionDescription, senderPeerId: string) => void) | null
  >(null);
  const onWebRTCIceCandidate = ref<
    ((candidate: WebRTCIceCandidate, senderPeerId: string) => void) | null
  >(null);
  const onError = ref<((message: string) => void) | null>(null);

  // Callbacks для обработки событий чата
  const onChatMessage = ref<((message: ChatMessage) => void) | null>(null);
  const onChatFile = ref<((message: ChatFileMessage) => void) | null>(null);
  const onChatReaction = ref<((reaction: ChatReaction) => void) | null>(null);
  const onChatRating = ref<((rating: ChatRating) => void) | null>(null);

  // Функция подключения к WebSocket
  const connect = () => {
    if (ws.value?.readyState === WebSocket.OPEN) {
      console.log("WebSocket уже подключен");
      return;
    }

    connectionStatus.value = "connecting";

    // Определяем URL WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/_ws`;

    ws.value = new WebSocket(wsUrl);

    ws.value.onopen = () => {
      console.log("[WS Client] Подключение установлено");
      isConnected.value = true;
      connectionStatus.value = "connected";
    };

    ws.value.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);

        // Обработка подтверждения подключения
        if (data.type === "connection" && data.status === "connected") {
          peerId.value = data.peerId || null;
          console.log(
            "[WS Client] Подключение подтверждено, Peer ID:",
            peerId.value
          );
        }

        // Обработка pong ответа
        if (data.type === "pong") {
          console.log("[WS Client] Получен pong, время:", data.timestamp);
        }

        // Обработка списка участников комнаты
        if (data.type === "room-participants" && data.payload) {
          const roomInfo: RoomInfo = {
            roomId: data.payload.roomId,
            participants: data.payload.participants || [],
          };
          participants.value = roomInfo.participants;
          participantsCount.value = roomInfo.participants.length + 1; // +1 для текущего пользователя
          onRoomParticipants.value?.(roomInfo);
        }

        // Обработка присоединения пользователя
        if (data.type === "user-joined" && data.payload) {
          const participant: Participant = {
            userId: data.payload.userId,
            userName: data.payload.userName,
            peerId: data.payload.peerId,
          };
          participants.value.push(participant);
          participantsCount.value = participants.value.length + 1;
          onUserJoined.value?.(participant);
        }

        // Обработка выхода пользователя
        if (data.type === "user-left" && data.payload) {
          const participant: Participant = {
            userId: data.payload.userId,
            userName: data.payload.userName,
            peerId: data.payload.peerId,
          };
          participants.value = participants.value.filter(
            (p) => p.peerId !== participant.peerId
          );
          participantsCount.value = participants.value.length + 1;
          onUserLeft.value?.(participant);
        }

        // Обработка обновления комнаты
        if (data.type === "room-updated" && data.payload) {
          participantsCount.value = data.payload.participantsCount || 0;
          onRoomUpdated.value?.(data.payload.roomId, participantsCount.value);
        }

        // Обработка списка комнат
        if (data.type === "rooms-list" && data.payload) {
          rooms.value = data.payload;
          onRoomsList.value?.(rooms.value);
        }

        // Обработка переключения аудио
        if (data.type === "user-audio-toggled" && data.payload) {
          onUserAudioToggled.value?.(data.payload.peerId, data.payload.enabled);
        }

        // Обработка переключения видео
        if (data.type === "user-video-toggled" && data.payload) {
          onUserVideoToggled.value?.(data.payload.peerId, data.payload.enabled);
        }

        // Обработка WebRTC offer
        if (data.type === "webrtc-offer" && data.payload) {
          onWebRTCOffer.value?.(data.payload.offer, data.payload.senderPeerId);
        }

        // Обработка WebRTC answer
        if (data.type === "webrtc-answer" && data.payload) {
          onWebRTCAnswer.value?.(
            data.payload.answer,
            data.payload.senderPeerId
          );
        }

        // Обработка ICE кандидата
        if (data.type === "webrtc-ice-candidate" && data.payload) {
          onWebRTCIceCandidate.value?.(
            data.payload.candidate,
            data.payload.senderPeerId
          );
        }

        // Обработка сообщений чата
        if (data.type === "chat-message" && data.payload) {
          onChatMessage.value?.(data.payload);
        }

        if (data.type === "chat-file" && data.payload) {
          onChatFile.value?.(data.payload);
        }

        if (data.type === "chat-reaction" && data.payload) {
          onChatReaction.value?.(data.payload);
        }

        if (data.type === "chat-rating" && data.payload) {
          onChatRating.value?.(data.payload);
        }

        // Обработка ошибок
        if (data.type === "error") {
          onError.value?.(
            data.payload?.message || data.status || "Произошла ошибка"
          );
        }

        console.log("[WS Client] Получено сообщение:", data);
      } catch (error) {
        console.error("[WS Client] Ошибка парсинга сообщения:", error);
      }
    };

    ws.value.onclose = (event) => {
      console.log("[WS Client] Соединение закрыто", event.code, event.reason);
      isConnected.value = false;
      connectionStatus.value = "disconnected";
      peerId.value = null;
      currentRoomId.value = null;
      participants.value = [];
      rooms.value = [];

      // Автоматическое переподключение через 3 секунды
      setTimeout(() => {
        if (connectionStatus.value === "disconnected") {
          console.log("[WS Client] Попытка переподключения...");
          connect();
        }
      }, 3000);
    };

    ws.value.onerror = (error) => {
      console.error("[WS Client] Ошибка WebSocket:", error);
      connectionStatus.value = "error";
      isConnected.value = false;
    };
  };

  // Функция отправки сообщения
  const send = (type: string, payload?: any) => {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn("[WS Client] WebSocket не подключен");
      return false;
    }

    try {
      ws.value.send(JSON.stringify({ type, payload }));
      return true;
    } catch (error) {
      console.error("[WS Client] Ошибка отправки сообщения:", error);
      return false;
    }
  };

  // Функция проверки соединения (ping/pong)
  const ping = () => {
    send("ping", { data: "some data" });
  };

  // Присоединение к комнате
  const joinRoom = (roomId: string, userId?: string, userName?: string) => {
    if (send("join-room", { roomId, userId, userName })) {
      currentRoomId.value = roomId;
      return true;
    }
    return false;
  };

  // Выход из комнаты
  const leaveRoom = (roomId: string) => {
    if (send("leave-room", { roomId })) {
      if (currentRoomId.value === roomId) {
        currentRoomId.value = null;
        participants.value = [];
        participantsCount.value = 0;
      }
      return true;
    }
    return false;
  };

  // Получение списка комнат
  const getRooms = () => {
    return send("get-rooms");
  };

  // Переключение аудио
  const toggleAudio = (roomId: string, enabled: boolean) => {
    return send("toggle-audio", { roomId, enabled });
  };

  // Переключение видео
  const toggleVideo = (roomId: string, enabled: boolean) => {
    return send("toggle-video", { roomId, enabled });
  };

  // Отправка WebRTC offer
  const sendWebRTCOffer = (
    offer: WebRTCSessionDescription,
    targetPeerId: string,
    roomId: string
  ) => {
    return send("webrtc-offer", { offer, targetPeerId, roomId });
  };

  // Отправка WebRTC answer
  const sendWebRTCAnswer = (
    answer: WebRTCSessionDescription,
    targetPeerId: string,
    roomId: string
  ) => {
    return send("webrtc-answer", { answer, targetPeerId, roomId });
  };

  // Отправка ICE кандидата
  const sendIceCandidate = (
    candidate: WebRTCIceCandidate,
    targetPeerId: string,
    roomId: string
  ) => {
    return send("webrtc-ice-candidate", { candidate, targetPeerId, roomId });
  };

  // Отправка текстового сообщения в чат
  const sendChatMessage = (roomId: string, text: string, userName: string) => {
    return send("chat-message", { roomId, text, userName });
  };

  // Отправка файла в чат
  const sendChatFile = (
    roomId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    fileData: string,
    userName: string
  ) => {
    return send("chat-file", {
      roomId,
      fileName,
      fileType,
      fileSize,
      fileData,
      userName,
    });
  };

  // Отправка реакции на сообщение
  const sendChatReaction = (
    roomId: string,
    messageId: string,
    emoji: string,
    userName: string
  ) => {
    return send("chat-reaction", { roomId, messageId, emoji, userName });
  };

  // Отправка рейтинга сообщения
  const sendChatRating = (
    roomId: string,
    messageId: string,
    rating: "like" | "dislike",
    userName: string
  ) => {
    return send("chat-rating", { roomId, messageId, rating, userName });
  };

  // Функция отключения
  const disconnect = () => {
    // Выходим из комнаты перед отключением
    if (currentRoomId.value) {
      leaveRoom(currentRoomId.value);
    }

    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
    isConnected.value = false;
    connectionStatus.value = "disconnected";
    peerId.value = null;
    currentRoomId.value = null;
    participants.value = [];
    rooms.value = [];
  };

  // Подключение при монтировании компонента
  onMounted(() => {
    connect();
  });

  // Отключение при размонтировании
  onUnmounted(() => {
    disconnect();
  });

  return {
    ws,
    isConnected,
    peerId,
    connectionStatus,
    currentRoomId,
    rooms,
    participants,
    participantsCount,
    connect,
    disconnect,
    send,
    ping,
    joinRoom,
    leaveRoom,
    getRooms,
    toggleAudio,
    toggleVideo,
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
    onChatMessage,
    onChatFile,
    onChatReaction,
    onChatRating,
    sendChatMessage,
    sendChatFile,
    sendChatReaction,
    sendChatRating,
  };
};
