
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
  isScreenSharing: boolean
) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasRemoteUser, setHasRemoteUser] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
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
    });

    webrtcConnection.current.onConnectionStateChange((state: string) => {
      setConnectionState(state);
      
      if (state === 'connected' || state === 'completed') {
        setIsConnected(true);
      } else {
        setIsConnected(state === 'connecting');
      }

      if (remoteParticipant) {
        setRemoteParticipant({...remoteParticipant, connectionState: state});
      }
    });

    // Send an initial presence message
    setTimeout(() => {
      signalingService.current?.send({
        type: "presence",
        sender: userId,
        metadata: {
          displayName: userDisplayName,
          userId: userId,
          isCameraOn: false,
          isMicOn: false,
          isScreenSharing: false
        }
      });
    }, 500);

    // Attempt to connect after a short delay
    const connectTimer = setTimeout(() => {
      webrtcConnection.current?.createOffer();
      setIsConnected(true);
      toast({
        title: "Connected to room",
        description: "You've successfully connected to room " + roomId,
      });
    }, 1000);

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
    }, 5000);

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
      clearTimeout(connectTimer);
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [roomId, userId, userDisplayName, toast, connectionState, isCameraOn, isMicOn, isScreenSharing]);

  // Monitor connection status and remote stream
  useEffect(() => {
    if (!webrtcConnection.current) return;
    
    // Check for tracks and connection status every second
    const statusCheckInterval = setInterval(() => {
      if (webrtcConnection.current) {
        // Check if we have remote tracks
        const hasRemoteUser = webrtcConnection.current.hasRemoteUserConnected();
        setHasRemoteUser(hasRemoteUser);
        
        // Update connection state
        const connectionState = webrtcConnection.current.getConnectionState();
        setIsConnected(connectionState === 'connected' || connectionState === 'completed');
        
        // If we have a remote user but no participant info, try to get it
        if (hasRemoteUser && !remoteParticipant && webrtcConnection.current.getRemoteUserId()) {
          const remoteMediaStream = webrtcConnection.current.getRemoteStream();
          setRemoteParticipant({
            userId: webrtcConnection.current.getRemoteUserId() || "",
            displayName: webrtcConnection.current.getRemoteDisplayName(),
            isCameraOn: remoteMediaStream.getVideoTracks().length > 0,
            isMicOn: remoteMediaStream.getAudioTracks().length > 0,
            isScreenSharing: false,
            connectionState: connectionState,
            joinedAt: Date.now()
          });
        }
      }
    }, 1000);

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [isConnected, remoteParticipant]);

  return {
    isConnected,
    hasRemoteUser,
    connectionState,
    remoteParticipant
  };
}
