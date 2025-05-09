
// Types for WebRTC functionality
import { SignalingData } from "@/utils/webrtc";

export interface RemoteParticipant {
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
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  isConnected: boolean;
  hasRemoteUser: boolean;
  remoteParticipant: RemoteParticipant | null;
  remoteParticipants: RemoteParticipant[];
  connectionState: string;
  userDisplayName: string;
  toggleCamera: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

export interface WebRTCState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  isConnected: boolean;
  hasRemoteUser: boolean;
  remoteParticipant: RemoteParticipant | null;
  remoteParticipants: RemoteParticipant[];
  connectionState: string;
}

export interface WebRTCHookDependencies {
  toast: any;
  roomId: string;
  userId: string;
  userDisplayName: string;
}
