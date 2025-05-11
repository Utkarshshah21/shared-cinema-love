
// Types for WebRTC functionality
import { StateUpdater } from "preact/hooks";

export interface RemoteParticipant {
  userId: string;   // Unique identifier for this participant
  id: string;       // Alias for userId to maintain compatibility
  displayName: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  connectionState: string;
  joinedAt: number;
  stream: MediaStream | null;
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
  toggleCamera: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleMicrophone: () => Promise<void>; // Alias for toggleMic
  toggleScreenShare: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  debugInfo?: any;
}

export interface SignalingData {
  type: string;
  sender: string;
  receiver?: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
  metadata?: any;
  timestamp?: number;
}

export interface PeerConfig {
  roomId: string;
  userId: string;
  displayName: string;
  onConnectionStateChange?: (state: string) => void;
  onRemoteStreamUpdate?: (stream: MediaStream | null) => void;
  onRemoteUserStatusChange?: (status: any) => void;
  onMessage?: (data: any) => void;
}
