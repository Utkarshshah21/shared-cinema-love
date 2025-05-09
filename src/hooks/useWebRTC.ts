import { useState, useEffect, useRef } from 'react';
import { WebRTCConnection, SignalingService, SignalingData, Participant } from '@/utils/webrtc';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

export interface RemoteParticipant {
  userId: string;
  displayName: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  connectionState: string;
  joinedAt: number;
}

export function useWebRTC(roomId: string, displayName: string = "User") {
  const { toast } = useToast();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasRemoteUser, setHasRemoteUser] = useState(false);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null);
  const [connectionState, setConnectionState] = useState<string>("new");
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  
  // Generate a random user ID for this session
  const userId = useRef(uuidv4()).current;
  const userDisplayName = useRef(displayName || "User " + userId.slice(0, 4)).current;
  
  const webrtcConnection = useRef<WebRTCConnection | null>(null);
  const signalingService = useRef<SignalingService | null>(null);
  const screenStream = useRef<MediaStream | null>(null);

  // Handle signaling messages
  const handleSignalingMessage = (data: SignalingData) => {
    if (!webrtcConnection.current) return;

    try {
      switch (data.type) {
        case 'offer':
          webrtcConnection.current.handleOffer(
            { type: 'offer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'answer':
          webrtcConnection.current.handleAnswer(
            { type: 'answer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'ice-candidate':
          if (data.candidate) {
            webrtcConnection.current.handleIceCandidate(data.candidate);
          }
          break;
        case 'presence':
          webrtcConnection.current.handlePresence(data.sender, data.metadata);
          // Also update participants list from presence messages
          if (data.metadata && data.sender !== userId) {
            updateRemoteParticipantsList(data.sender, data.metadata);
          }
          break;
        case 'status-update':
          webrtcConnection.current.handleStatusUpdate(data.sender, data.metadata);
          if (data.metadata && data.sender !== userId) {
            updateRemoteParticipantsList(data.sender, data.metadata);
          }
          break;
        case 'participant-left':
          if (data.sender !== userId) {
            removeParticipant(data.sender);
          }
          break;
        default:
          console.log('Unknown signaling message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  };

  // Update remote participants list from signaling data
  const updateRemoteParticipantsList = (senderId: string, metadata: any) => {
    setRemoteParticipants(prev => {
      // Check if this participant already exists
      const existingIndex = prev.findIndex(p => p.userId === senderId);
      
      const updatedParticipant = {
        userId: senderId,
        displayName: metadata.displayName || "User " + senderId.slice(0, 4),
        isCameraOn: metadata.isCameraOn || false,
        isMicOn: metadata.isMicOn || false, 
        isScreenSharing: metadata.isScreenSharing || false,
        connectionState: connectionState,
        joinedAt: Date.now()
      };

      // If participant exists, update their info
      if (existingIndex >= 0) {
        const updatedParticipants = [...prev];
        updatedParticipants[existingIndex] = {
          ...updatedParticipants[existingIndex],
          ...updatedParticipant,
        };
        return updatedParticipants;
      } 
      
      // Otherwise, add as new participant
      toast({
        title: "New participant joined",
        description: `${metadata.displayName || "A user"} has joined the room`,
      });
      return [...prev, updatedParticipant];
    });
  };

  // Remove a participant from the list when they leave
  const removeParticipant = (participantId: string) => {
    setRemoteParticipants(prev => {
      const participant = prev.find(p => p.userId === participantId);
      if (participant) {
        toast({
          title: "Participant left",
          description: `${participant.displayName} has left the room`,
        });
      }
      return prev.filter(p => p.userId !== participantId);
    });
  };

  // Initialize WebRTC and signaling
  useEffect(() => {
    // Create a unique user ID for this session if not already set
    const sendSignalingMessage = (data: SignalingData) => {
      signalingService.current?.send(data);
    };

    // Initialize WebRTC connection with display name
    webrtcConnection.current = new WebRTCConnection(
      userId,
      roomId,
      userDisplayName,
      sendSignalingMessage
    );

    // Set up callbacks for remote user status and connection state
    webrtcConnection.current.onRemoteUserStatusChange((status) => {
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
      
      // Also update the participants list
      updateRemoteParticipantsList(status.userId, status);
    });

    webrtcConnection.current.onConnectionStateChange((state) => {
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

    // Initialize signaling service with display name
    signalingService.current = new SignalingService(
      roomId,
      userId,
      userDisplayName,
      handleSignalingMessage
    );

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
      webrtcConnection.current?.close();
      signalingService.current?.stop();
    };
  }, [roomId, userId, userDisplayName, toast, connectionState, isCameraOn, isMicOn, isScreenSharing]);

  // Set up the remote stream and check connection status
  useEffect(() => {
    if (!webrtcConnection.current) return;
    
    const remoteMediaStream = webrtcConnection.current.getRemoteStream();
    setRemoteStream(remoteMediaStream);

    // Check for tracks and connection status every second
    const statusCheckInterval = setInterval(() => {
      if (webrtcConnection.current) {
        // Check if we have remote tracks
        const hasRemoteUser = webrtcConnection.current.hasRemoteUserConnected();
        setHasRemoteUser(hasRemoteUser);
        
        // Update connection state
        const connectionState = webrtcConnection.current.getConnectionState();
        setIsConnected(connectionState === 'connected' || connectionState === 'completed');
        
        // Force a re-render of the remote stream if tracks are added
        if (hasRemoteUser && remoteMediaStream.getTracks().length > 0) {
          setRemoteStream(null);
          setTimeout(() => setRemoteStream(remoteMediaStream), 10);
        }

        // If we have a remote user but no participant info, try to get it
        if (hasRemoteUser && !remoteParticipant && webrtcConnection.current.getRemoteUserId()) {
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

  // Toggle camera
  const toggleCamera = async () => {
    if (isCameraOn) {
      // Turn off camera
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.stop());
        setLocalStream(prevStream => {
          if (prevStream) {
            return new MediaStream(prevStream.getAudioTracks());
          }
          return null;
        });
      }
      setIsCameraOn(false);
      
      // Update WebRTC to reflect camera status
      if (webrtcConnection.current) {
        const audioOnlyStream = localStream ? new MediaStream(localStream.getAudioTracks()) : null;
        if (audioOnlyStream) {
          webrtcConnection.current.setLocalStream(audioOnlyStream);
        }
      }
    } else {
      try {
        // Turn off screen sharing first if active
        if (isScreenSharing) {
          await toggleScreenShare();
        }
        
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: isMicOn
        });
        
        // If we already have a stream with audio, add those tracks
        if (localStream && localStream.getAudioTracks().length > 0) {
          const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...localStream.getAudioTracks()
          ]);
          setLocalStream(combinedStream);
          webrtcConnection.current?.setLocalStream(combinedStream);
        } else {
          setLocalStream(stream);
          webrtcConnection.current?.setLocalStream(stream);
        }
        
        setIsCameraOn(true);
        toast({
          title: "Camera turned on",
          description: "Your camera is now active",
        });
      } catch (error) {
        console.error("Error accessing camera:", error);
        toast({
          title: "Camera access failed",
          description: "Could not access your camera. Please check permissions.",
          variant: "destructive"
        });
      }
    }
  };
  
  // Toggle screen sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Turn off screen sharing
      if (screenStream.current) {
        screenStream.current.getTracks().forEach(track => track.stop());
        screenStream.current = null;
      }
      
      // If camera was on before, turn it back on
      if (localStream) {
        if (isCameraOn) {
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ 
              video: true 
            });
            
            const combinedStream = new MediaStream([
              ...videoStream.getVideoTracks(),
              ...localStream.getAudioTracks()
            ]);
            
            setLocalStream(combinedStream);
            webrtcConnection.current?.setLocalStream(combinedStream);
          } catch (error) {
            console.error("Error restoring camera:", error);
          }
        } else {
          // Just keep audio
          const audioOnlyStream = new MediaStream(localStream.getAudioTracks());
          setLocalStream(audioOnlyStream);
          webrtcConnection.current?.setLocalStream(audioOnlyStream);
        }
      }
      
      setIsScreenSharing(false);
    } else {
      try {
        // Request screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStream.current = stream;
        
        // Combine with audio tracks if mic is on
        if (localStream && localStream.getAudioTracks().length > 0) {
          const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...localStream.getAudioTracks()
          ]);
          setLocalStream(combinedStream);
          webrtcConnection.current?.setLocalStream(combinedStream);
        } else {
          setLocalStream(stream);
          webrtcConnection.current?.setLocalStream(stream);
        }
        
        // Set camera as off
        setIsCameraOn(false);
        setIsScreenSharing(true);
        
        // Handle user stopping share via browser UI
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          screenStream.current = null;
          
          // Reset local stream to just audio if mic is on
          if (localStream && isMicOn) {
            const audioOnlyStream = new MediaStream(localStream.getAudioTracks());
            setLocalStream(audioOnlyStream);
            webrtcConnection.current?.setLocalStream(audioOnlyStream);
          } else {
            setLocalStream(null);
          }
        };
        
        toast({
          title: "Screen sharing started",
          description: "You are now sharing your screen",
        });
      } catch (error) {
        console.error("Error sharing screen:", error);
        toast({
          title: "Screen sharing failed",
          description: "Could not share your screen. Please try again.",
          variant: "destructive"
        });
      }
    }
  };
  
  // Toggle microphone
  const toggleMic = async () => {
    if (isMicOn) {
      // Turn off microphone
      if (localStream) {
        localStream.getAudioTracks().forEach(track => track.stop());
        setLocalStream(prevStream => {
          if (prevStream) {
            return new MediaStream(prevStream.getVideoTracks());
          }
          return null;
        });
      }
      setIsMicOn(false);
      
      // Update WebRTC connection
      if (webrtcConnection.current && localStream) {
        const videoOnlyStream = new MediaStream(localStream.getVideoTracks());
        webrtcConnection.current.setLocalStream(videoOnlyStream);
      }
    } else {
      try {
        // Request microphone access
        const audioStream = await navigator.mediaDevices.getUserMedia({ 
          audio: true 
        });
        
        // Combine with existing video tracks if camera or screen is on
        if (localStream && localStream.getVideoTracks().length > 0) {
          const combinedStream = new MediaStream([
            ...localStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
          ]);
          setLocalStream(combinedStream);
          webrtcConnection.current?.setLocalStream(combinedStream);
        } else {
          setLocalStream(audioStream);
          webrtcConnection.current?.setLocalStream(audioStream);
        }
        
        setIsMicOn(true);
        toast({
          title: "Microphone turned on",
          description: "Your microphone is now active",
        });
      } catch (error) {
        console.error("Error accessing microphone:", error);
        toast({
          title: "Microphone access failed",
          description: "Could not access your microphone. Please check permissions.",
          variant: "destructive"
        });
      }
    }
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
    toggleScreenShare
  };
}
