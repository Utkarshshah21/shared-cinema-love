
// Re-export useZegoCloud as useWebRTC for backward compatibility
import { useZegoCloud } from './useZegoCloud';
import type { ZegoCloudConfig } from './useZegoCloud';

// Map ZegoCloud types to match the existing WebRTC types for compatibility
export interface RemoteParticipant {
  id: string;
  stream: MediaStream;
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  toggleCamera: () => Promise<boolean>;
  toggleMicrophone: () => Promise<boolean>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  isConnected: boolean;
  isCameraOn: boolean;
  isMicrophoneOn: boolean;
  hasRemoteParticipants: boolean;
}

// Default configuration for ZegoCloud
const DEFAULT_CONFIG: ZegoCloudConfig = {
  appID: 1481071172,
  roomID: 'shared-cinema-default'
};

export function useWebRTC(roomId?: string): UseWebRTCReturn {
  // Configure ZegoCloud with the provided roomId or use a default one
  const config: ZegoCloudConfig = {
    ...DEFAULT_CONFIG,
    roomID: roomId || DEFAULT_CONFIG.roomID
  };

  const {
    localStream,
    remoteStreams,
    toggleCamera,
    toggleMic,
    connect,
    disconnect,
    isCameraOn,
    isMicOn,
    isConnected,
    hasRemoteUsers
  } = useZegoCloud(config);

  // Convert remoteStreams Map to the expected RemoteParticipant[] format
  const remoteParticipants: RemoteParticipant[] = Array.from(remoteStreams).map(
    ([id, stream]) => ({
      id,
      stream
    })
  );

  // Return the API in the format expected by the existing useWebRTC hook
  return {
    localStream,
    remoteParticipants,
    toggleCamera,
    toggleMicrophone: toggleMic,
    connect,
    disconnect,
    isConnected,
    isCameraOn,
    isMicrophoneOn: isMicOn,
    hasRemoteParticipants: hasRemoteUsers
  };
}
