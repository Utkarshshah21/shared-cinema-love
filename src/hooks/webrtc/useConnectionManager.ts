
import { useState, useEffect } from 'react';
import { RemoteParticipant } from './types';
import { useToast } from '@/components/ui/use-toast';

export function useConnectionManager(
  webrtcConnection: React.MutableRefObject<any>,
  signalingService: React.MutableRefObject<any>,
  userId: string,
  userDisplayName: string,
  roomId: string,
  isCameraOn: boolean,
  isMicOn: boolean,
  isScreenSharing: boolean,
  connectionState: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasRemoteUser, setHasRemoteUser] = useState(false);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null);
  const { toast } = useToast();

  // Initialize connection and set up event listeners
  useEffect(() => {
    if (!webrtcConnection.current || !signalingService.current) return;

    // Set up callbacks for remote user status and connection state
    webrtcConnection.current.onRemoteUserStatusChange((status: any) => {
      setRemoteParticipant({
        userId: status.userId,
        displayName: status.displayName || "Remote User",
        isCameraOn: status.isCameraOn || false,
        isMicOn: status.isMicOn || false,
        isScreenSharing: status.isScreenSharing || false,
        connectionState: connectionState,
        joinedAt: Date.now()
      });
      setHasRemoteUser(true);
      
      console.log(`Remote user status updated: ${status.displayName || "Unknown"} (${status.userId})`, status);
    });

    // Send an initial presence message immediately
    signalingService.current?.send({
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

    // Set up a faster heartbeat to improve participant detection
    const heartbeatInterval = setInterval(() => {
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
    }, 1000); // More frequent heartbeats (reduced from 3000ms)

    // Handle page unload to notify others that we're leaving
    const handleUnload = () => {
      if (signalingService.current) {
        // Send multiple leave messages to improve reliability
        for (let i = 0; i < 3; i++) {
          signalingService.current.send({
            type: "participant-left",
            sender: userId,
            timestamp: Date.now()
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    
    // Also send a periodic renegotiation request to ensure connections stay fresh
    const renegotiationInterval = setInterval(() => {
      if (webrtcConnection.current && hasRemoteUser && connectionState === 'connected') {
        console.log("Sending periodic renegotiation request");
        webrtcConnection.current.createOffer(true); // Force a renegotiation
      }
    }, 60000); // Once a minute

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(renegotiationInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [roomId, userId, userDisplayName, toast, connectionState, isCameraOn, isMicOn, isScreenSharing, hasRemoteUser]);

  // Update connection status based on connection state
  useEffect(() => {
    if (connectionState === 'connected' || connectionState === 'completed') {
      setIsConnected(true);
    } else if (connectionState === 'connecting' || connectionState === 'new') {
      setIsConnected(true); // Still show as connected during connection process for better UX
    } else {
      setIsConnected(false);
    }
  }, [connectionState]);

  // Monitor connection status and remote stream more actively
  useEffect(() => {
    if (!webrtcConnection.current) return;
    
    // Check for tracks and connection status more frequently
    const statusCheckInterval = setInterval(() => {
      if (webrtcConnection.current) {
        // Check if we have remote tracks
        const hasRemoteUser = webrtcConnection.current.hasRemoteUserConnected();
        setHasRemoteUser(hasRemoteUser);
        
        // If we have a remote user but no participant info, try to get it
        if (hasRemoteUser && !remoteParticipant && webrtcConnection.current.getRemoteUserId()) {
          const remoteMediaStream = webrtcConnection.current.getRemoteStream();
          const remoteId = webrtcConnection.current.getRemoteUserId() || "";
          const remoteName = webrtcConnection.current.getRemoteDisplayName() || "Remote User";
          
          console.log(`Remote user detected: ${remoteName} (${remoteId})`);
          
          setRemoteParticipant({
            userId: remoteId,
            displayName: remoteName,
            isCameraOn: remoteMediaStream?.getVideoTracks().length > 0 || false,
            isMicOn: remoteMediaStream?.getAudioTracks().length > 0 || false,
            isScreenSharing: false,
            connectionState: webrtcConnection.current.getConnectionState() || "new",
            joinedAt: Date.now()
          });
        }
        
        // Check for active remote users
        const activeUsers = webrtcConnection.current.getActiveRemoteUsers?.();
        if (activeUsers && activeUsers.length > 0) {
          setHasRemoteUser(true);
          console.log("Active remote users:", activeUsers);
        }
        
        // Force reconnection if we're stuck in a pending state
        if (connectionState === 'checking' || connectionState === 'connecting') {
          const connectionTime = webrtcConnection.current.getConnectionTime?.();
          if (connectionTime && Date.now() - connectionTime > 10000) {
            console.log("Connection appears stuck, attempting to refresh");
            webrtcConnection.current.refreshIceServers();
            webrtcConnection.current.createOffer(true);
          }
        }
      }
    }, 500); // Check much more frequently (reduced from 1000ms)

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [remoteParticipant, connectionState]);

  return {
    isConnected,
    hasRemoteUser,
    remoteParticipant
  };
}
