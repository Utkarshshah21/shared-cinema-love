
import { useZegoCloud } from './useZegoCloud';
import type { RemoteParticipant } from './webrtc/types';

// Define the return type for the useWebRTC hook
export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicOn: boolean;
  isMicrophoneOn: boolean;
  isScreenSharing: boolean;
  isConnected: boolean;
  hasRemoteUser: boolean;
  hasRemoteParticipants: boolean;
  remoteParticipant: RemoteParticipant | null;
  remoteParticipants: RemoteParticipant[];
  connectionState: string;
  userDisplayName: string;
  toggleCamera: () => Promise<boolean | void>;
  toggleMic: () => Promise<boolean | void>;
  toggleMicrophone: () => Promise<boolean | void>;
  toggleScreenShare: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  debugInfo?: {
    userId: string;
    roomId: string;
    connectionState: string;
    remoteParticipantsCount: number;
    hasRemoteUser: boolean;
    connectionStateLog: string[];
    localStreamTracks?: string;
    remoteStreamTracks?: string;
  };
}

// Re-export types
export type { RemoteParticipant };

// useWebRTC hook that internally uses ZegoCloud
export function useWebRTC(roomId: string, displayName: string = "User"): UseWebRTCReturn {
  // Use the ZegoCloud service
  const {
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isConnected,
    roomState,
    hasRemoteUsers,
    userID,
    userName,
    connect,
    disconnect,
    toggleCamera,
    toggleMic,
    startLocalStream
  } = useZegoCloud({
    roomID: roomId,
    userName: displayName
  });

  // Create a single remoteStream from the first available remoteStream
  const remoteStream = remoteStreams.size > 0 
    ? Array.from(remoteStreams.values())[0] 
    : null;

  // Convert remoteStreams Map to an array of RemoteParticipant objects
  const remoteParticipants: RemoteParticipant[] = Array.from(remoteStreams.entries()).map(
    ([userId, stream]) => ({
      userId,
      id: userId, // For backward compatibility
      displayName: `User_${userId.slice(0, 4)}`,
      isCameraOn: stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled,
      isMicOn: stream.getAudioTracks().length > 0 && stream.getAudioTracks()[0].enabled,
      isScreenSharing: false, // We don't track this separately in ZegoCloud implementation
      connectionState: 'connected',
      joinedAt: Date.now(),
      stream
    })
  );

  // First remote participant or null
  const remoteParticipant = remoteParticipants.length > 0 ? remoteParticipants[0] : null;
  
  // Debug info for troubleshooting
  const debugInfo = {
    userId: userID,
    roomId,
    connectionState: roomState,
    remoteParticipantsCount: remoteParticipants.length,
    hasRemoteUser: hasRemoteUsers,
    connectionStateLog: [roomState],
    localStreamTracks: localStream 
      ? `Video: ${localStream.getVideoTracks().length}, Audio: ${localStream.getAudioTracks().length}`
      : 'No local stream',
    remoteStreamTracks: remoteStream
      ? `Video: ${remoteStream.getVideoTracks().length}, Audio: ${remoteStream.getAudioTracks().length}`
      : 'No remote stream'
  };

  // Screen sharing is not directly supported in our ZegoCloud wrapper,
  // so we'll provide a stub implementation
  const toggleScreenShare = async (): Promise<void> => {
    console.log("Screen sharing not implemented in ZegoCloud wrapper");
    return Promise.resolve();
  };

  // Return object that matches the UseWebRTCReturn interface
  return {
    localStream,
    remoteStream,
    isCameraOn,
    isMicOn,
    isMicrophoneOn: isMicOn, // Alias for isMicOn
    isScreenSharing: false, // Not tracking separately in ZegoCloud
    isConnected,
    hasRemoteUser: hasRemoteUsers,
    hasRemoteParticipants: hasRemoteUsers, // Alias for hasRemoteUser
    remoteParticipant,
    remoteParticipants,
    connectionState: roomState,
    userDisplayName: userName,
    toggleCamera,
    toggleMic,
    toggleMicrophone: toggleMic, // Alias for toggleMic
    toggleScreenShare,
    connect,
    disconnect,
    debugInfo
  };
}
