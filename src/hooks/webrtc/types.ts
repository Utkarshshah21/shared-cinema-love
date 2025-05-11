
// Types for WebRTC functionality

export interface RemoteParticipant {
  userId: string;
  displayName: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  connectionState: string;
  joinedAt: number;
  id: string;     // Added for compatibility with old code
  stream: MediaStream | null;  // Changed to allow null for compatibility
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicOn: boolean;
  isMicrophoneOn: boolean; // Alias for isMicOn
  isScreenSharing: boolean;
  isConnected: boolean;
  hasRemoteUser: boolean;
  hasRemoteParticipants: boolean; // Alias for hasRemoteUser
  remoteParticipant: RemoteParticipant | null;
  remoteParticipants: RemoteParticipant[];
  connectionState: string;
  userDisplayName: string;
  toggleCamera: () => Promise<boolean | void>;
  toggleMic: () => Promise<boolean | void>;
  toggleMicrophone: () => Promise<boolean | void>; // Alias for toggleMic
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

// Add SignalingData type for useSignalingHandler
export interface SignalingData {
  type: string;
  sender: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
  metadata?: any;
  timestamp?: number;
}
