import { useRef, useEffect, useState, useCallback } from 'react';
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
    // Use an IIFE to initialize the ref value correctly
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
      // Clear outdated room data to avoid connection issues
      SignalingService.cleanupOldRoomData(roomId);
      
      // Also clear any stale user IDs if they're too old
      const lastActiveTimestamp = sessionStorage.getItem(`webrtc_last_active_${roomId}`);
      if (lastActiveTimestamp) {
        const lastActiveTime = parseInt(lastActiveTimestamp, 10);
        const currentTime = Date.now();
        // If last active time was more than 12 hours ago, generate a new user ID
        if (currentTime - lastActiveTime > 12 * 60 * 60 * 1000) {
          const newId = uuidv4();
          sessionStorage.setItem(`webrtc_user_id_${roomId}`, newId);
          console.log("Generated new user ID due to stale session:", newId);
        }
      }
      
      // Update last active timestamp
      sessionStorage.setItem(`webrtc_last_active_${roomId}`, Date.now().toString());
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
  const [connectionState, setConnectionState] = useState<string>("new");
  
  // Periodically attempt reconnection if needed more aggressively
  useEffect(() => {
    let reconnectInterval: number | null = null;
    
    if (connectionState === "failed" || connectionState === "disconnected") {
      reconnectInterval = window.setInterval(() => {
        console.log("Reconnection attempt...");
        if (webrtcConnection.current) {
          webrtcConnection.current.refreshIceServers();
          webrtcConnection.current.createOffer(true); // Force a new offer
        }
      }, 2000); // More frequent reconnection attempts (reduced from 5000ms)
    }
    
    return () => {
      if (reconnectInterval !== null) {
        window.clearInterval(reconnectInterval);
      }
    };
  }, [connectionState]);

  // Log connection state changes
  const handleConnectionStateChange = useCallback((state: string) => {
    console.log(`WebRTC connection state: ${state}`);
    setConnectionState(state);
    setConnectionStateLog(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${state}`]);
    
    // Notify user of connection changes
    if (state === "connected") {
      toast({
        title: "Connection established",
        description: "You're now connected to the room",
      });
    } else if (state === "failed") {
      toast({
        title: "Connection failed",
        description: "Unable to connect to the room. Trying again...",
        variant: "destructive"
      });
    } else if (state === "disconnected") {
      toast({
        title: "Disconnected",
        description: "Connection lost. Reconnecting...",
        variant: "destructive"
      });
    }
  }, [toast]);
  
  // Create signaling callback
  const sendSignalingMessage = useCallback((data: any) => {
    signalingService.current?.send(data);
  }, []);

  // Signaling handler
  const { handleSignalingMessage } = useSignalingHandler(
    webrtcConnection, 
    updateRemoteParticipantsList, 
    removeParticipant, 
    userId,
    connectionState
  );
  
  // Initialize WebRTC and signaling on first render
  useEffect(() => {
    if (!webrtcConnection.current && roomId && userId) {
      // Create WebRTC connection
      webrtcConnection.current = new WebRTCConnection(
        userId,
        roomId,
        userDisplayName,
        sendSignalingMessage
      );
      
      // Register connection state change handler
      webrtcConnection.current.onConnectionStateChange(handleConnectionStateChange);
      
      // Create signaling service
      signalingService.current = new SignalingService(
        roomId,
        userId,
        userDisplayName,
        handleSignalingMessage
      );
      
      // Log connection info for debugging
      console.log(`WebRTC initialized - Room: ${roomId}, User: ${userId}, Name: ${userDisplayName}`);
      
      // Force a regular refresh of STUN/TURN servers
      const refreshIceServersInterval = setInterval(() => {
        if (webrtcConnection.current && webrtcConnection.current.refreshIceServers) {
          webrtcConnection.current.refreshIceServers();
        }
      }, 20000); // More frequent refresh (reduced from 30000ms)
      
      const cleanupHandler = () => {
        if (signalingService.current) {
          signalingService.current.stop();
        }
        if (webrtcConnection.current) {
          webrtcConnection.current.close();
        }
      };
      
      window.addEventListener('beforeunload', cleanupHandler);
      
      // Create initial offer after a brief delay to allow signaling setup
      // but also use different timing for different users to reduce collision
      const offerDelay = Math.floor(500 + Math.random() * 1000);
      setTimeout(() => {
        if (webrtcConnection.current) {
          console.log(`Creating initial offer after ${offerDelay}ms delay`);
          webrtcConnection.current.createOffer();
          
          // Also start sending presence messages immediately
          if (signalingService.current) {
            signalingService.current.send({
              type: "presence",
              sender: userId,
              metadata: {
                displayName: userDisplayName,
                userId: userId,
                isCameraOn: isCameraOn,
                isMicOn: isMicOn,
                isScreenSharing: isScreenSharing
              },
              timestamp: Date.now()
            });
          }
        }
      }, offerDelay);
      
      // Set up periodic offer creation to ensure connection attempts continue
      const periodicOfferInterval = setInterval(() => {
        if (webrtcConnection.current && connectionState !== "connected" && connectionState !== "completed") {
          console.log("Creating periodic offer to ensure connection attempts continue");
          webrtcConnection.current.refreshIceServers();
          webrtcConnection.current.createOffer();
        }
      }, 8000); // Every 8 seconds while not connected
      
      return () => {
        window.removeEventListener('beforeunload', cleanupHandler);
        clearInterval(refreshIceServersInterval);
        clearInterval(periodicOfferInterval);
        cleanupHandler();
      };
    }
  }, [roomId, userId, userDisplayName, handleSignalingMessage, handleConnectionStateChange, sendSignalingMessage, connectionState, isCameraOn, isMicOn, isScreenSharing]);
  
  // Connection manager
  const { isConnected, hasRemoteUser, remoteParticipant } = 
    useConnectionManager(
      webrtcConnection, 
      signalingService, 
      userId, 
      userDisplayName, 
      roomId, 
      isCameraOn, 
      isMicOn, 
      isScreenSharing,
      connectionState
    );
  
  // Debug information for connection troubleshooting
  const debugInfo = {
    userId,
    roomId,
    connectionState,
    remoteParticipantsCount: remoteParticipants.length,
    hasRemoteUser,
    connectionStateLog,
    localStreamTracks: localStream ? localStream.getTracks().map(t => t.kind).join(', ') : 'none',
    remoteStreamTracks: remoteStream ? remoteStream.getTracks().map(t => t.kind).join(', ') : 'none'
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
