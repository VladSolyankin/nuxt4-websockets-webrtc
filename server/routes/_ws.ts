/// <reference types="webrtc" />
import { defineWebSocketHandler } from "#imports";

interface UserInfo {
  id: string;
  name?: string;
  peerId: string;
}

interface RoomData {
  participants: Map<string, UserInfo>;
  messages: Array<any>; // История сообщений чата
}

// Интерфейсы для WebRTC signaling данных (структура данных для передачи через WebSocket)
interface WebRTCSessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

interface WebRTCIceCandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  usernameFragment?: string | null;
}

// Комнаты
const rooms = new Map<string, RoomData>();

// peer -> roomId
const peerToRoom = new Map<string, string>();

// peer -> UserInfo
const peerToUser = new Map<string, UserInfo>();

// Хранилище peerId -> peer объект (для точечной отправки сообщений)
const peerStore = new Map<string, any>();

export default defineWebSocketHandler({
  // Открытие соединения
  open(peer) {
    console.log(`[WS] Пользователь подключён: ${peer.id}`);
    peerStore.set(peer.id, peer);

    // Отправляем клиенту его peerId при подключении
    peer.send(
      JSON.stringify({
        type: "connection",
        status: "connected",
        peerId: peer.id,
      })
    );
  },

  // Обработка сообщений
  message(peer, message) {
    try {
      const data = JSON.parse(message.text());
      const { type, payload } = data;

      switch (type) {
        case "join-room":
          handleJoinRoom(peer, payload);
          break;
        case "leave-room":
          handleLeaveRoom(peer, payload);
          break;
        case "webrtc-offer":
          handleWebRTCOffer(peer, payload);
          break;
        case "webrtc-answer":
          handleWebRTCAnswer(peer, payload);
          break;
        case "webrtc-ice-candidate":
          handleWebRTCIceCandidate(peer, payload);
          break;
        case "get-rooms":
          handleGetRooms(peer);
          break;
        case "toggle-audio":
          handleToggleAudio(peer, payload);
          break;
        case "toggle-video":
          handleToggleVideo(peer, payload);
          break;
        case "chat-message":
          handleChatMessage(peer, payload);
          break;
        case "chat-file":
          handleChatFile(peer, payload);
          break;
        case "chat-reaction":
          handleChatReaction(peer, payload);
          break;
        case "chat-rating":
          handleChatRating(peer, payload);
          break;
        default:
          console.warn(`[WS] Неизвестный тип сообщения: ${type}`);
      }
    } catch (error) {
      console.error(`[WS] Ошибка обработки сообщения: ${error}`);
      peer.send(
        JSON.stringify({
          type: "error",
          message: "Ошибка обработки сообщения",
        })
      );
    }
  },

  // Закрытие соединения
  close(peer) {
    console.log(`[WS] Пользователь отключён: ${peer.id}`);

    // Удаляем пользователя из всех комнат
    const roomId = peerToRoom.get(peer.id);

    if (roomId) {
      removeUserFromRoom(peer.id, roomId);
    }

    // Очищаем данные пользователя
    peerToRoom.delete(peer.id);
    peerToUser.delete(peer.id);
    peerStore.delete(peer.id);
  },

  // Обработка ошибок
  error(peer, error) {
    console.error(`[WS] Ошибка для peer ${peer.id}: ${error}`);
  },
});

// Присоединение к комнате
function handleJoinRoom(
  peer: any,
  payload: { roomId: string; userId?: string; userName?: string }
) {
  // Защита от undefined payload
  if (!payload?.roomId) {
    console.error(`[WS] Неверный payload для join-room от ${peer.id}`);
    return;
  }

  const { roomId, userId, userName } = payload;

  // Проверка: если пользователь уже в другой комнате, сначала выходим
  const currentRoomId = peerToRoom.get(peer.id);
  if (currentRoomId && currentRoomId !== roomId) {
    removeUserFromRoom(peer.id, currentRoomId);
  }

  // Если пользователь уже в этой комнате, просто отправляем список участников
  if (currentRoomId === roomId) {
    const room = rooms.get(roomId);
    if (room) {
      const participantsList = Array.from(room.participants.values())
        .filter((p) => p.peerId !== peer.id)
        .map((p) => ({
          userId: p.id,
          userName: p.name,
          peerId: p.peerId,
        }));

      peer.send(
        JSON.stringify({
          type: "room-participants",
          payload: {
            roomId,
            participants: participantsList,
          },
        })
      );
    }
    return;
  }

  // Создаём комнату, если её нет
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { participants: new Map(), messages: [] });
  }

  // Получаем комнату и данные о пользователе
  const room = rooms.get(roomId)!;
  const userInfo: UserInfo = {
    id: userId || peer.id,
    name: userName || `Пользователь ${peer.id.slice(0, 6)}`,
    peerId: peer.id,
  };

  // Добавляем пользователя в комнату
  room.participants.set(peer.id, userInfo);
  peerToRoom.set(peer.id, roomId);
  peerToUser.set(peer.id, userInfo);

  // Подписка на комнату
  peer.subscribe(`room:${roomId}`);

  // Информация о новом участнике для всех остальных пользователей
  sendToRoom(
    roomId,
    {
      type: "user-joined",
      payload: {
        userId: userInfo.id,
        userName: userInfo.name,
        peerId: peer.id,
      },
    },
    peer.id
  );

  // Отправляем новому пользователю список участников комнаты
  const participantsList = Array.from(room.participants.values())
    .filter((p) => p.peerId !== peer.id)
    .map((p) => ({
      userId: p.id,
      userName: p.name,
      peerId: p.peerId,
    }));

  peer.send(
    JSON.stringify({
      type: "room-participants",
      payload: {
        roomId,
        participants: participantsList,
      },
    })
  );

  // Отправляем обновлённое количество участников всем в комнате
  sendToRoom(roomId, {
    type: "room-updated",
    payload: {
      roomId,
      participantsCount: room.participants.size,
    },
  });

  console.log(
    `[WS] Пользователь ${userInfo.name} присоединился к комнате ${roomId}`
  );
}

// Выход из комнаты
function handleLeaveRoom(peer: any, payload: { roomId: string }) {
  if (!payload?.roomId) {
    console.error(`[WS] Неверный payload для leave-room от ${peer.id}`);
    return;
  }

  removeUserFromRoom(peer.id, payload.roomId);
}

// Получение списка всех комнат
function handleGetRooms(peer: any) {
  const roomsList = Array.from(rooms.entries()).map(([roomId, room]) => ({
    id: roomId,
    participantsCount: room.participants.size,
  }));

  peer.send(
    JSON.stringify({
      type: "rooms-list",
      payload: roomsList,
    })
  );
}

// Обработка включения/выключения микрофона
function handleToggleAudio(
  peer: any,
  payload: { roomId: string; enabled: boolean }
) {
  if (!payload?.roomId) {
    console.error(`[WS] Неверный payload для toggle-audio от ${peer.id}`);
    return;
  }

  sendToRoom(
    payload.roomId,
    {
      type: "user-audio-toggled",
      payload: {
        peerId: peer.id,
        enabled: payload.enabled,
      },
    },
    peer.id
  );
}

// Обработка включения/выключения камеры
function handleToggleVideo(
  peer: any,
  payload: { roomId: string; enabled: boolean }
) {
  if (!payload?.roomId) {
    console.error(`[WS] Неверный payload для toggle-video от ${peer.id}`);
    return;
  }

  sendToRoom(
    payload.roomId,
    {
      type: "user-video-toggled",
      payload: {
        peerId: peer.id,
        enabled: payload.enabled,
      },
    },
    peer.id
  );
}

// Удаление пользователя из комнаты
function removeUserFromRoom(peerId: string, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const userInfo = room.participants.get(peerId);
  if (!userInfo) return;

  room.participants.delete(peerId);
  peerToRoom.delete(peerId);
  peerToUser.delete(peerId);

  // Уведомление остальным участникам
  sendToRoom(roomId, {
    type: "user-left",
    payload: {
      userId: userInfo.id,
      userName: userInfo.name,
      peerId: peerId,
    },
  });

  // Если комнаты пустая - удаляем
  if (room.participants.size === 0) {
    rooms.delete(roomId);
  } else {
    // Отправляем обновлённое количество участников
    sendToRoom(roomId, {
      type: "room-updated",
      payload: {
        roomId,
        participantsCount: room.participants.size,
      },
    });
  }

  console.log(`[WS] Пользователь ${userInfo.name} покинул комнату ${roomId}`);
}

// broadcast для комнаты
function sendToRoom(roomId: string, message: any, excludePeerId?: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);

  room.participants.forEach((userInfo, peerId) => {
    if (peerId !== excludePeerId) {
      const peer = peerStore.get(peerId);
      if (peer) {
        try {
          peer.send(messageStr);
        } catch (error) {
          console.error(
            `[WS] Ошибка отправки сообщения peer ${peerId}:`,
            error
          );
          // Удаляем peer из комнаты при ошибке отправки (соединение разорвано)
          removeUserFromRoom(peerId, roomId);
        }
      }
    }
  });
}

// Обработка WebRTC-offer
function handleWebRTCOffer(
  peer: any,
  payload: {
    offer: WebRTCSessionDescription;
    targetPeerId: string;
    roomId: string;
  }
) {
  if (!payload?.offer || !payload?.targetPeerId || !payload?.roomId) {
    console.error(`[WS] Неверный payload для webrtc-offer от ${peer.id}`);
    return;
  }

  const { offer, targetPeerId } = payload;
  const targetPeer = peerStore.get(targetPeerId);

  if (targetPeer) {
    targetPeer.send(
      JSON.stringify({
        type: "webrtc-offer",
        payload: {
          offer,
          senderPeerId: peer.id,
        },
      })
    );
  } else {
    console.warn(`[WS] Target peer ${targetPeerId} не найден для offer`);
  }
}

// Обработка WebRTC-answer
function handleWebRTCAnswer(
  peer: any,
  payload: {
    answer: WebRTCSessionDescription;
    targetPeerId: string;
    roomId: string;
  }
) {
  if (!payload?.answer || !payload?.targetPeerId || !payload?.roomId) {
    console.error(`[WS] Неверный payload для webrtc-answer от ${peer.id}`);
    return;
  }

  const { answer, targetPeerId } = payload;
  const targetPeer = peerStore.get(targetPeerId);

  if (targetPeer) {
    targetPeer.send(
      JSON.stringify({
        type: "webrtc-answer",
        payload: {
          answer,
          senderPeerId: peer.id,
        },
      })
    );
  } else {
    console.warn(`[WS] Target peer ${targetPeerId} не найден для answer`);
  }
}

// Обработка ICE кандидата WebRTC
function handleWebRTCIceCandidate(
  peer: any,
  payload: {
    candidate: WebRTCIceCandidate;
    targetPeerId: string;
    roomId: string;
  }
) {
  if (!payload?.candidate || !payload?.targetPeerId || !payload?.roomId) {
    console.error(
      `[WS] Неверный payload для webrtc-ice-candidate от ${peer.id}`
    );
    return;
  }

  const { candidate, targetPeerId } = payload;
  const targetPeer = peerStore.get(targetPeerId);

  if (targetPeer) {
    targetPeer.send(
      JSON.stringify({
        type: "webrtc-ice-candidate",
        payload: {
          candidate,
          senderPeerId: peer.id,
        },
      })
    );
  } else {
    console.warn(
      `[WS] Target peer ${targetPeerId} не найден для ICE candidate`
    );
  }
}

// Обработка текстового сообщения в чате
function handleChatMessage(
  peer: any,
  payload: { roomId: string; text: string; userName: string }
) {
  if (!payload?.roomId || !payload?.text || !payload?.userName) {
    console.error(`[WS] Неверный payload для chat-message от ${peer.id}`);
    return;
  }

  const { roomId, text, userName } = payload;
  const room = rooms.get(roomId);

  if (!room) {
    console.error(`[WS] Комната ${roomId} не найдена`);
    return;
  }

  const userInfo = peerToUser.get(peer.id);
  if (!userInfo) {
    console.error(`[WS] Пользователь ${peer.id} не найден`);
    return;
  }

  const message = {
    id: `${peer.id}-${Date.now()}`,
    roomId,
    peerId: peer.id,
    userName: userInfo.name || userName,
    text,
    timestamp: Date.now(),
    reactions: [],
    rating: { messageId: "", likes: 0, dislikes: 0 },
  };

  // Сохраняем сообщение в истории комнаты
  room.messages.push(message);
  // Ограничиваем историю последними 100 сообщениями
  if (room.messages.length > 100) {
    room.messages = room.messages.slice(-100);
  }

  // Отправляем сообщение всем участникам комнаты
  sendToRoom(roomId, {
    type: "chat-message",
    payload: message,
  });

  console.log(`[WS] Сообщение отправлено в комнату ${roomId} от ${userName}`);
}

// Обработка файла в чате
function handleChatFile(
  peer: any,
  payload: {
    roomId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileData: string;
    userName: string;
  }
) {
  if (
    !payload?.roomId ||
    !payload?.fileName ||
    !payload?.fileData ||
    !payload?.userName
  ) {
    console.error(`[WS] Неверный payload для chat-file от ${peer.id}`);
    return;
  }

  const { roomId, fileName, fileType, fileSize, fileData } = payload;

  // Проверка размера файла (10MB максимум)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (fileSize > maxSize) {
    peer.send(
      JSON.stringify({
        type: "error",
        payload: { message: "Файл слишком большой. Максимальный размер: 10MB" },
      })
    );
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    console.error(`[WS] Комната ${roomId} не найдена`);
    return;
  }

  const userInfo = peerToUser.get(peer.id);
  if (!userInfo) {
    console.error(`[WS] Пользователь ${peer.id} не найден`);
    return;
  }

  const message = {
    id: `${peer.id}-${Date.now()}`,
    roomId,
    peerId: peer.id,
    userName: userInfo.name || payload.userName,
    fileName,
    fileType,
    fileSize,
    fileData,
    timestamp: Date.now(),
    reactions: [],
    rating: { messageId: "", likes: 0, dislikes: 0 },
  };

  // Сохраняем сообщение в истории комнаты
  room.messages.push(message);
  // Ограничиваем историю последними 100 сообщениями
  if (room.messages.length > 100) {
    room.messages = room.messages.slice(-100);
  }

  // Отправляем файл всем участникам комнаты
  sendToRoom(roomId, {
    type: "chat-file",
    payload: message,
  });

  console.log(
    `[WS] Файл отправлен в комнату ${roomId} от ${
      userInfo.name || payload.userName
    }`
  );
}

// Обработка реакции на сообщение
function handleChatReaction(
  peer: any,
  payload: {
    roomId: string;
    messageId: string;
    emoji: string;
    userName: string;
  }
) {
  if (
    !payload?.roomId ||
    !payload?.messageId ||
    !payload?.emoji ||
    !payload?.userName
  ) {
    console.error(`[WS] Неверный payload для chat-reaction от ${peer.id}`);
    return;
  }

  const { roomId, messageId, emoji } = payload;
  const room = rooms.get(roomId);

  if (!room) {
    console.error(`[WS] Комната ${roomId} не найдена`);
    return;
  }

  const userInfo = peerToUser.get(peer.id);
  if (!userInfo) {
    console.error(`[WS] Пользователь ${peer.id} не найден`);
    return;
  }

  const reaction = {
    messageId,
    peerId: peer.id,
    userName: userInfo.name || payload.userName,
    emoji,
    timestamp: Date.now(),
  };

  // Отправляем реакцию всем участникам комнаты
  sendToRoom(roomId, {
    type: "chat-reaction",
    payload: reaction,
  });

  console.log(`[WS] Реакция добавлена к сообщению ${messageId}`);
}

// Обработка рейтинга сообщения
function handleChatRating(
  peer: any,
  payload: {
    roomId: string;
    messageId: string;
    rating: "like" | "dislike";
    userName: string;
  }
) {
  if (
    !payload?.roomId ||
    !payload?.messageId ||
    !payload?.rating ||
    !payload?.userName
  ) {
    console.error(`[WS] Неверный payload для chat-rating от ${peer.id}`);
    return;
  }

  const { roomId, messageId, rating } = payload;
  const room = rooms.get(roomId);

  if (!room) {
    console.error(`[WS] Комната ${roomId} не найдена`);
    return;
  }

  // Находим сообщение в истории
  const message = room.messages.find((msg) => msg.id === messageId);
  if (!message) {
    console.error(`[WS] Сообщение ${messageId} не найдено`);
    return;
  }

  // Инициализируем рейтинг, если его нет
  if (!message.rating) {
    message.rating = { messageId, likes: 0, dislikes: 0 };
  }

  // Обновляем рейтинг
  if (rating === "like") {
    message.rating.likes += 1;
  } else {
    message.rating.dislikes += 1;
  }

  // Отправляем обновленный рейтинг всем участникам комнаты
  sendToRoom(roomId, {
    type: "chat-rating",
    payload: {
      messageId,
      likes: message.rating.likes,
      dislikes: message.rating.dislikes,
    },
  });

  console.log(`[WS] Рейтинг обновлен для сообщения ${messageId}`);
}
