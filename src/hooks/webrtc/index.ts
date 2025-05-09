
import { useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { WebRTCConnection, SignalingService } from '@/utils/webrtc';
import { useParticipantTracking } from './useParticipantTracking';
import { useMediaControls } from './useMediaControls';
import { useConnectionManager } from './useConnectionManager';
import { useSignalingHandler } from './useSignalingHandler';
import { useRemoteStream } from './useRemoteStream';
import { UseWebRTCReturn } from './types';

export function useWebRTC(roomId: string, displayName: string = "User"): UseWebRTCReturn {
  const { toast } = useToast();
  
  // Generate a random user ID for this session
  const userId = useRef(uuidv4()).current;
  const userDisplayName = useRef(displayName || "User " + userId.slice(0, 4)).current;
  
  // References for WebRTC connection and streams
  const webrtcConnection = useRef<WebRTCConnection | null>(null);
  const signalingService = useRef<SignalingService | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  
  // Participant tracking
  const { remoteParticipants, updateRemoteParticipantsList, removeParticipant } = useParticipantTracking();
  
  // Media controls
  const { localStream, isCameraOn, isMicOn, isScreenSharing, toggleCamera, toggleMic, toggleScreenShare } = 
    useMediaControls(webrtcConnection, screenStream);
  
  // Remote stream
  const remoteStream = useRemoteStream(webrtcConnection);

  // Signaling handler
  const { handleSignalingMessage } = useSignalingHandler(
    webrtcConnection, 
    updateRemoteParticipantsList, 
    removeParticipant, 
    userId,
    webrtcConnection.current?.getConnectionState() || "new"
  );
  
  // Connection manager
  const { isConnected, hasRemoteUser, connectionState, remoteParticipant } = 
    useConnectionManager(
      webrtcConnection, 
      signalingService, 
      userId, 
      userDisplayName, 
      roomId, 
      isCameraOn, 
      isMicOn, 
      isScreenSharing
    );
  
  // Initialize WebRTC and signaling on first render
  if (!webrtcConnection.current) {
    // Set up signaling callback
    const sendSignalingMessage = (data: any) => {
      signalingService.current?.send(data);
    };

    // Create WebRTC connection
    webrtcConnection.current = new WebRTCConnection(
      userId,
      roomId,
      userDisplayName,
      sendSignalingMessage
    );
    
    // Create signaling service
    signalingService.current = new SignalingService(
      roomId,
      userId,
      userDisplayName,
      handleSignalingMessage
    );
  }
  
  return {
    localStream,
    remoteStream,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    isConnected,
    hasRemoteUser,
    remoteParticipant,
    remoteParticipants,
    connectionState,
    userDisplayName,
    toggleCamera,
    toggleMic,
    toggleScreenShare
  };
}

// Re-export types
export * from './types';
