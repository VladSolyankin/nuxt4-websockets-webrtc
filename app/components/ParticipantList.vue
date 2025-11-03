<template>
  <div class="bg-white rounded-lg shadow p-6">
    <h2 class="text-xl font-semibold mb-4">
      Участники ({{ participants.length + 1 }})
    </h2>

    <div v-if="participants.length === 0" class="text-gray-500 text-center py-4">
      Вы один в комнате
    </div>

    <div v-else class="space-y-2">
      <!-- Текущий пользователь -->
      <div class="flex items-center justify-between p-3 bg-blue-50 border rounded">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
            {{ userName.charAt(0).toUpperCase() }}
          </div>
          <div>
            <div class="font-medium">{{ userName }} (Вы)</div>
            <div class="text-sm text-gray-500">Peer ID: {{ peerId?.slice(0, 8) }}...</div>
          </div>
        </div>
        <div class="flex gap-2">
          <span
            class="px-2 py-1 text-xs rounded"
            :class="audioEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ audioEnabled ? "🎤" : "🔇" }}
          </span>
          <span
            class="px-2 py-1 text-xs rounded"
            :class="videoEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ videoEnabled ? "📹" : "📷" }}
          </span>
        </div>
      </div>

      <!-- Другие участники -->
      <div
        v-for="participant in participants"
        :key="participant.peerId"
        class="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gray-500 rounded-full flex items-center justify-center text-white font-semibold">
            {{ (participant.userName || "User").charAt(0).toUpperCase() }}
          </div>
          <div>
            <div class="font-medium">
              {{ participant.userName || `Пользователь ${participant.peerId.slice(0, 6)}` }}
            </div>
            <div class="text-sm text-gray-500">
              Peer ID: {{ participant.peerId.slice(0, 8) }}...
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <span
            class="px-2 py-1 text-xs rounded"
            :class="getParticipantAudioState(participant.peerId) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ getParticipantAudioState(participant.peerId) ? "🎤" : "🔇" }}
          </span>
          <span
            class="px-2 py-1 text-xs rounded"
            :class="getParticipantVideoState(participant.peerId) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
          >
            {{ getParticipantVideoState(participant.peerId) ? "📹" : "📷" }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Participant } from "~/composables/useWebSocket";
import type { RemoteStream } from "~/composables/useWebRTC";

interface Props {
  participants: Participant[];
  peerId: string | null;
  userName: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  remoteStreams: Map<string, RemoteStream>;
}

const props = defineProps<Props>();

const getParticipantAudioState = (peerId: string): boolean => {
  const remoteStream = props.remoteStreams.get(peerId);
  return remoteStream?.audioEnabled ?? true;
};

const getParticipantVideoState = (peerId: string): boolean => {
  const remoteStream = props.remoteStreams.get(peerId);
  return remoteStream?.videoEnabled ?? true;
};
</script>
