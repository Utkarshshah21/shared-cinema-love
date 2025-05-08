import { useState, useEffect, useRef } from 'react';
import { WebRTCConnection, SignalingService, SignalingData } from '@/utils/webrtc';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

export function useWebRTC(roomId: string) {
  const { toast } = useToast();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Generate a random user ID for this session
  const userId = useRef(uuidv4()).current;
  
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
            data.sender
          );
          break;
        case 'answer':
          webrtcConnection.current.handleAnswer(
            { type: 'answer', sdp: data.sdp } as RTCSessionDescriptionInit
          );
          break;
        case 'ice-candidate':
          if (data.candidate) {
            webrtcConnection.current.handleIceCandidate(data.candidate);
          }
          break;
        default:
          console.log('Unknown signaling message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  };

  // Initialize WebRTC and signaling
  useEffect(() => {
    // Create a unique user ID for this session
    const sendSignalingMessage = (data: SignalingData) => {
      signalingService.current?.send(data);
    };

    // Initialize WebRTC connection
    webrtcConnection.current = new WebRTCConnection(
      userId,
      roomId,
      sendSignalingMessage
    );

    // Initialize signaling service
    signalingService.current = new SignalingService(
      roomId,
      userId,
      handleSignalingMessage
    );

    // Attempt to connect after a short delay
    const connectTimer = setTimeout(() => {
      webrtcConnection.current?.createOffer();
      setIsConnected(true);
      toast({
        title: "Connected!",
        description: "You've successfully connected to room " + roomId,
      });
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      webrtcConnection.current?.close();
      signalingService.current?.stop();
    };
  }, [roomId, userId, toast]);

  // Set up the remote stream
  useEffect(() => {
    if (!webrtcConnection.current) return;
    
    const remoteMediaStream = webrtcConnection.current.getRemoteStream();
    setRemoteStream(remoteMediaStream);

    // Check for tracks every second (in case they're added later)
    const trackCheckInterval = setInterval(() => {
      if (remoteMediaStream.getTracks().length > 0) {
        setRemoteStream(null); // Force a re-render
        setRemoteStream(remoteMediaStream);
      }
    }, 1000);

    return () => {
      clearInterval(trackCheckInterval);
    };
  }, [isConnected]);

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
    toggleCamera,
    toggleMic,
    toggleScreenShare
  };
}
