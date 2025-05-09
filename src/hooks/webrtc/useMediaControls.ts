import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

export function useMediaControls(
  webrtcConnection: React.MutableRefObject<any>,
  screenStream: React.MutableRefObject<MediaStream | null>
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const { toast } = useToast();

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
    isCameraOn,
    isMicOn,
    isScreenSharing,
    setLocalStream,
    toggleCamera,
    toggleMic,
    toggleScreenShare
  };
}
