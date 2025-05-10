
import { useRef, useEffect, useState } from 'react';
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
  
  // Generate a random user ID for this session that persists across refreshes
  const userId = useRef<string>(
    // Initialize with existing ID from sessionStorage or create a new one
    (() => {
      // Try to get existing userId from sessionStorage
      const existingId = sessionStorage.getItem(`webrtc_user_id_${roomId}`);
      if (existingId) return existingId;
      
      // Create new ID if none exists
      const newId = uuidv4();
      sessionStorage.setItem(`webrtc_user_id_${roomId}`, newId);
      return newId;
    })()
  ).current;
  
  const userDisplayName = useRef(displayName || "User " + userId.slice(0, 4)).current;
  
  // References for WebRTC connection and streams
  const webrtcConnection = useRef<WebRTCConnection | null>(null);
  const signalingService = useRef<SignalingService | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  
  // Clear room data on first visit (helps avoid stale signaling data)
  useEffect(() => {
    if (typeof SignalingService !== 'undefined') {
      // Clear room data, but only partially to allow reconnections
      SignalingService.cleanupOldRoomData(roomId);
    }
    
    // Send a beacon when the page unloads to notify others
    const handleBeforeUnload = () => {
      if (signalingService.current) {
        // Use sendBeacon for more reliable "I'm leaving" messages
        const leaveData = JSON.stringify({
          type: "participant-left",
          sender: userId,
          timestamp: Date.now()
        });
        
        try {
          navigator.sendBeacon(`/api/webrtc-signal?room=${roomId}&event=leave&userId=${userId}`, leaveData);
        } catch (e) {
          console.error("Failed to send leave beacon", e);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roomId, userId]);
  
  // Participant tracking
  const { remoteParticipants, updateRemoteParticipantsList, removeParticipant } = useParticipantTracking();
  
  // Media controls
  const { localStream, isCameraOn, isMicOn, isScreenSharing, toggleCamera, toggleMic, toggleScreenShare } = 
    useMediaControls(webrtcConnection, screenStream);
  
  // Remote stream
  const remoteStream = useRemoteStream(webrtcConnection);

  // Monitor connection state for debugging
  const [connectionStateLog, setConnectionStateLog] = useState<string[]>([]);
  
  // Log connection state changes
  useEffect(() => {
    if (webrtcConnection.current) {
      const logState = (state: string) => {
        console.log(`WebRTC connection state: ${state}`);
        setConnectionStateLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${state}`]);
      };
      
      webrtcConnection.current.onConnectionStateChange(logState);
    }
  }, []);

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
  useEffect(() => {
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
      
      // Log connection info for debugging
      console.log(`WebRTC initialized - Room: ${roomId}, User: ${userId}, Name: ${userDisplayName}`);
      
      // Ensure clean disconnection when navigating away
      const cleanupHandler = () => {
        if (signalingService.current) {
          signalingService.current.stop();
        }
        if (webrtcConnection.current) {
          webrtcConnection.current.close();
        }
      };
      
      window.addEventListener('beforeunload', cleanupHandler);
      
      // Force a regular refresh of STUN/TURN servers
      const refreshIceServersInterval = setInterval(() => {
        if (webrtcConnection.current && webrtcConnection.current.refreshIceServers) {
          webrtcConnection.current.refreshIceServers();
        }
      }, 30000); // every 30 seconds
      
      return () => {
        window.removeEventListener('beforeunload', cleanupHandler);
        clearInterval(refreshIceServersInterval);
        cleanupHandler();
      };
    }
  }, [roomId, userId, userDisplayName, handleSignalingMessage]);
  
  // Debug information for connection troubleshooting
  const debugInfo = {
    userId,
    roomId,
    connectionState,
    remoteParticipantsCount: remoteParticipants.length,
    hasRemoteUser,
    connectionStateLog
  };
  
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
    toggleScreenShare,
    debugInfo
  };
}

// Re-export types
export type { RemoteParticipant, UseWebRTCReturn } from './types';
