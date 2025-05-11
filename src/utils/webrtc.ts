
// Re-export useZegoCloud as useWebRTC for backward compatibility
import { useZegoCloud } from '@/hooks/useZegoCloud';
import type { ZegoCloudConfig } from '@/hooks/useZegoCloud';

// Add these types to maintain compatibility with existing code
export interface SignalingData {
  type: string;
  sender: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
  metadata?: any;
  timestamp?: number;
}

export interface WebRTCConnection {
  // Stub interface to make type checking work
}

export interface SignalingService {
  // Stub interface to make type checking work
}

// Map ZegoCloud types to match the existing WebRTC types for compatibility
export interface RemoteParticipant {
  id: string;
  stream: MediaStream;
  userId: string;
  displayName: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  connectionState: string;
  joinedAt: number;
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  remoteStream: MediaStream | null;
  toggleCamera: () => Promise<boolean>;
  toggleMicrophone: () => Promise<boolean>;
  toggleScreenShare?: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  isConnected: boolean;
  isCameraOn: boolean;
  isMicrophoneOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  hasRemoteParticipants: boolean;
  hasRemoteUser: boolean;
  remoteParticipant: RemoteParticipant | null;
  connectionState: string;
  userDisplayName: string;
  debugInfo?: any;
}

// Default configuration for ZegoCloud
const DEFAULT_CONFIG: ZegoCloudConfig = {
  appID: 1481071172,
  appSign: '2a3a63461704e7438ee9a307f03f442e71689240e360afaa27861e7a0b96c944',
  serverSecret: '10859fa006c38a78077b5f1e919134d1',
  roomID: 'shared-cinema-default'
};

export function useWebRTC(roomId?: string, userName?: string): UseWebRTCReturn {
  // Configure ZegoCloud with the provided roomId or use a default one
  const config: ZegoCloudConfig = {
    ...DEFAULT_CONFIG,
    roomID: roomId || DEFAULT_CONFIG.roomID,
    userName: userName
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
    hasRemoteUsers,
    roomState,
    userName: userDisplayName,
    startLocalStream
  } = useZegoCloud(config);

  // Convert remoteStreams Map to the expected RemoteParticipant[] format
  const remoteParticipants: RemoteParticipant[] = Array.from(remoteStreams).map(
    ([id, stream]) => ({
      id,
      stream,
      userId: id,
      displayName: `User ${id.slice(0, 4)}`,
      isCameraOn: true,
      isMicOn: true,
      isScreenSharing: false,
      connectionState: 'connected',
      joinedAt: Date.now()
    })
  );

  // Create a single remoteStream from the first available remote stream
  const remoteStream = remoteStreams.size > 0 ? 
    Array.from(remoteStreams.values())[0] : null;

  // Create a single remoteParticipant object from the first available participant
  const remoteParticipant = remoteParticipants.length > 0 ? 
    remoteParticipants[0] : null;

  // Implement toggleScreenShare as a no-op function for compatibility
  const toggleScreenShare = async () => {
    console.log("Screen sharing not implemented in ZegoCloud adapter");
    return Promise.resolve();
  };

  // Return the API in the format expected by the existing useWebRTC hook
  return {
    localStream,
    remoteParticipants,
    remoteStream,
    toggleCamera,
    toggleMicrophone: toggleMic,
    toggleScreenShare,
    connect,
    disconnect,
    isConnected,
    isCameraOn,
    isMicrophoneOn: isMicOn,
    isMicOn,
    isScreenSharing: false,
    hasRemoteParticipants: hasRemoteUsers,
    hasRemoteUser: hasRemoteUsers,
    remoteParticipant,
    connectionState: roomState || 'disconnected',
    userDisplayName: userDisplayName || `User`,
    debugInfo: {
      userId: userDisplayName,
      roomId: config.roomID,
      connectionState: roomState,
      remoteParticipantsCount: remoteParticipants.length,
      hasRemoteUser: hasRemoteUsers,
      connectionStateLog: [roomState || 'disconnected'],
      localStreamTracks: localStream ? localStream.getTracks().map(t => t.kind).join(', ') : 'none',
      remoteStreamTracks: remoteStream ? remoteStream.getTracks().map(t => t.kind).join(', ') : 'none'
    }
  };
}
