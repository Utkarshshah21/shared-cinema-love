
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
        displayName: status.displayName,
        isCameraOn: status.isCameraOn,
        isMicOn: status.isMicOn,
        isScreenSharing: status.isScreenSharing,
        connectionState: connectionState,
        joinedAt: Date.now()
      });
      setHasRemoteUser(true);
      
      console.log(`Remote user status updated: ${status.displayName} (${status.userId})`, status);
    });

    // Send an initial presence message
    setTimeout(() => {
      signalingService.current?.send({
        type: "presence",
        sender: userId,
        metadata: {
          displayName: userDisplayName,
          userId: userId,
          isCameraOn: isCameraOn,
          isMicOn: isMicOn,
          isScreenSharing: isScreenSharing
        }
      });
    }, 500);

    // Set up a heartbeat to detect disconnected users
    const heartbeatInterval = setInterval(() => {
      signalingService.current?.send({
        type: "presence",
        sender: userId,
        metadata: {
          displayName: userDisplayName,
          userId: userId,
          isCameraOn: isCameraOn,
          isMicOn: isMicOn,
          isScreenSharing: isScreenSharing
        }
      });
    }, 3000);

    // Handle page unload to notify others that we're leaving
    const handleUnload = () => {
      if (signalingService.current) {
        signalingService.current.send({
          type: "participant-left",
          sender: userId
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [roomId, userId, userDisplayName, toast, connectionState, isCameraOn, isMicOn, isScreenSharing]);

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

  // Monitor connection status and remote stream
  useEffect(() => {
    if (!webrtcConnection.current) return;
    
    // Check for tracks and connection status every second
    const statusCheckInterval = setInterval(() => {
      if (webrtcConnection.current) {
        // Check if we have remote tracks
        const hasRemoteUser = webrtcConnection.current.hasRemoteUserConnected();
        setHasRemoteUser(hasRemoteUser);
        
        // If we have a remote user but no participant info, try to get it
        if (hasRemoteUser && !remoteParticipant && webrtcConnection.current.getRemoteUserId()) {
          const remoteMediaStream = webrtcConnection.current.getRemoteStream();
          setRemoteParticipant({
            userId: webrtcConnection.current.getRemoteUserId() || "",
            displayName: webrtcConnection.current.getRemoteDisplayName() || "Remote User",
            isCameraOn: remoteMediaStream?.getVideoTracks().length > 0 || false,
            isMicOn: remoteMediaStream?.getAudioTracks().length > 0 || false,
            isScreenSharing: false,
            connectionState: webrtcConnection.current.getConnectionState() || "new",
            joinedAt: Date.now()
          });
        }
        
        // Check for active remote users
        const activeUsers = webrtcConnection.current.getActiveRemoteUsers();
        if (activeUsers && activeUsers.length > 0) {
          setHasRemoteUser(true);
          
          // Log active users for debugging
          console.log("Active remote users:", activeUsers);
        }
      }
    }, 1000);

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [remoteParticipant]);

  return {
    isConnected,
    hasRemoteUser,
    remoteParticipant
  };
}
