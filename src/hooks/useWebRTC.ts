
import { useZegoCloud } from './useZegoCloud';
import type { RemoteParticipant } from './webrtc/types';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Re-export types
export type { RemoteParticipant };

// useWebRTC hook that internally uses ZegoCloud
export function useWebRTC(roomId: string, displayName: string = "User") {
  const { toast } = useToast();
  
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

  // State for screen sharing
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [connectionStateLog, setConnectionStateLog] = useState<string[]>([roomState]);
  
  // Track connection state changes
  useEffect(() => {
    if (roomState) {
      setConnectionStateLog(prev => {
        // Don't add duplicate consecutive states
        if (prev[prev.length - 1] !== roomState) {
          return [...prev, roomState];
        }
        return prev;
      });
    }
  }, [roomState]);
  
  // Create a single remoteStream from the first available remoteStream
  const remoteStream = remoteStreams.size > 0 
    ? Array.from(remoteStreams.values())[0] 
    : null;

  // Convert remoteStreams Map to an array of RemoteParticipant objects with all required properties
  const remoteParticipants: RemoteParticipant[] = Array.from(remoteStreams.entries()).map(
    ([userId, stream]) => {
      // Check for valid stream with tracks
      const hasVideoTracks = stream && stream.getVideoTracks().length > 0;
      const hasAudioTracks = stream && stream.getAudioTracks().length > 0;
      
      return {
        userId,
        id: userId, // Required property for backward compatibility
        displayName: `User_${userId.slice(0, 4)}`,
        isCameraOn: hasVideoTracks && stream.getVideoTracks()[0].enabled,
        isMicOn: hasAudioTracks && stream.getAudioTracks()[0].enabled,
        isScreenSharing: false, // We don't track this separately in ZegoCloud implementation
        connectionState: 'connected',
        joinedAt: Date.now(),
        stream // Required property - the actual MediaStream
      };
    }
  );

  // First remote participant or null
  const remoteParticipant = remoteParticipants.length > 0 ? remoteParticipants[0] : null;
  
  // Debug info for troubleshooting with more detail
  const debugInfo = {
    userId: userID,
    roomId,
    connectionState: roomState,
    remoteParticipantsCount: remoteParticipants.length,
    hasRemoteUser: hasRemoteUsers,
    connectionStateLog,
    localStreamTracks: localStream 
      ? `Video: ${localStream.getVideoTracks().length} (${localStream.getVideoTracks().length > 0 ? 
          localStream.getVideoTracks()[0].enabled ? 'enabled' : 'disabled' : 'none'}), 
         Audio: ${localStream.getAudioTracks().length} (${localStream.getAudioTracks().length > 0 ? 
          localStream.getAudioTracks()[0].enabled ? 'enabled' : 'disabled' : 'none'})`
      : 'No local stream',
    remoteStreamTracks: remoteStream
      ? `Video: ${remoteStream.getVideoTracks().length} (${remoteStream.getVideoTracks().length > 0 ? 
          remoteStream.getVideoTracks()[0].enabled ? 'enabled' : 'disabled' : 'none'}), 
         Audio: ${remoteStream.getAudioTracks().length} (${remoteStream.getAudioTracks().length > 0 ? 
          remoteStream.getAudioTracks()[0].enabled ? 'enabled' : 'disabled' : 'none'})`
      : 'No remote stream'
  };

  // Screen sharing implementation with better error handling
  const toggleScreenShare = useCallback(async (): Promise<void> => {
    try {
      if (!isScreenSharing) {
        // Stop existing screen stream if there is one
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
          setScreenStream(null);
        }
        
        // Get screen share stream
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: true // Include audio if sharing a tab with audio
        });
        
        // Handle screen sharing ended by user
        stream.getVideoTracks()[0].onended = () => {
          console.log("Screen sharing ended by user");
          setIsScreenSharing(false);
          setScreenStream(null);
          toast({
            title: "Screen Sharing Ended",
            description: "Screen sharing has been stopped",
          });
        };
        
        setScreenStream(stream);
        setIsScreenSharing(true);
        
        toast({
          title: "Screen Sharing Started",
          description: "You are now sharing your screen",
        });
      } else {
        // Stop all tracks in the screen stream
        if (screenStream) {
          screenStream.getTracks().forEach(track => {
            track.stop();
          });
        }
        
        setIsScreenSharing(false);
        setScreenStream(null);
        
        toast({
          title: "Screen Sharing Stopped",
          description: "Screen sharing has been turned off",
        });
      }
    } catch (error) {
      console.error("Error toggling screen share:", error);
      setIsScreenSharing(false);
      setScreenStream(null);
      
      toast({
        title: "Screen Sharing Error",
        description: "Failed to start screen sharing. Please try again.",
        variant: "destructive"
      });
    }
    
    return Promise.resolve();
  }, [isScreenSharing, screenStream, toast]);

  // Auto connect on component mount
  useEffect(() => {
    if (roomId && !isConnected) {
      console.log("Auto-connecting to room:", roomId);
      connect().then(success => {
        if (success) {
          console.log("Auto-connected successfully");
          // Optionally start camera/mic automatically
          // startLocalStream(true, true);
        } else {
          console.log("Auto-connection failed");
        }
      });
    }
    
    // Clean up screen sharing on unmount
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomId]);

  // Return object that matches the UseWebRTCReturn interface
  return {
    localStream,
    remoteStream,
    isCameraOn,
    isMicOn,
    isMicrophoneOn: isMicOn, // Alias for isMicOn
    isScreenSharing,
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
