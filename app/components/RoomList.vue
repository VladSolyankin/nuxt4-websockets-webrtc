<template>
  <div class="bg-white rounded-lg shadow p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">Комнаты</h2>
      <button
        @click="refreshRooms"
        :disabled="!isConnected"
        class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        Обновить
      </button>
    </div>

    <div v-if="rooms.length === 0" class="text-gray-500 text-center py-4">
      Нет доступных комнат
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="room in rooms"
        :key="room.id"
        class="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
      >
        <div>
          <div class="font-medium">Комната: {{ room.id }}</div>
          <div class="text-sm text-gray-500">
            Участников: {{ room.participantsCount }}
          </div>
        </div>
        <button
          @click="joinRoom(room.id)"
          :disabled="!isConnected || currentRoomId === room.id"
          class="px-4 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {{ currentRoomId === room.id ? "Вы в комнате" : "Присоединиться" }}
        </button>
      </div>
    </div>

    <!-- Форма создания новой комнаты -->
    <div class="mt-6 pt-6 border-t">
      <h3 class="text-lg font-semibold mb-3">Создать новую комнату</h3>
      <div class="flex gap-2">
        <input
          v-model="newRoomId"
          type="text"
          placeholder="Введите ID комнаты"
          class="flex-1 px-3 py-2 border rounded"
          @keyup.enter="createRoom"
        />
        <button
          @click="createRoom"
          :disabled="!isConnected || !newRoomId.trim()"
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Создать
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { Room } from "~/composables/useWebSocket";

interface Props {
  rooms: Room[];
  isConnected: boolean;
  currentRoomId: string | null;
  getRooms: () => boolean;
  joinRoom: (roomId: string, userId?: string, userName?: string) => boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  roomCreated: [roomId: string];
}>();

const newRoomId = ref("");

// Обновление списка комнат при подключении
watch(
  () => props.isConnected,
  (connected) => {
    if (connected) {
      props.getRooms();
    }
  }
);

const refreshRooms = () => {
  props.getRooms();
};

const createRoom = () => {
  if (newRoomId.value.trim() && props.isConnected) {
    props.joinRoom(newRoomId.value.trim());
    emit("roomCreated", newRoomId.value.trim());
    newRoomId.value = "";
  }
};
</script>
