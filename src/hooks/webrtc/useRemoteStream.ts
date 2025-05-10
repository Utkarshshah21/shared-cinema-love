
import { useState, useEffect } from 'react';

export function useRemoteStream(webrtcConnectionRef: React.MutableRefObject<any>) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Set up the remote stream
  useEffect(() => {
    if (!webrtcConnectionRef.current) return;
    
    // Initial setup
    const remoteMediaStream = webrtcConnectionRef.current.getRemoteStream();
    setRemoteStream(remoteMediaStream);
    
    // Register callback to be notified when remote tracks change
    const handleRemoteStreamUpdate = (updatedStream: MediaStream) => {
      console.log("Remote stream updated:", 
        updatedStream ? `Video tracks: ${updatedStream.getVideoTracks().length}, Audio tracks: ${updatedStream.getAudioTracks().length}` : "No stream");
      
      setRemoteStream(null); // Force a re-render
      setTimeout(() => setRemoteStream(updatedStream), 10);
    };
    
    webrtcConnectionRef.current.onRemoteStreamUpdate(handleRemoteStreamUpdate);
    
    // Force a re-render of the remote stream periodically to ensure it's displayed
    const trackMonitorInterval = setInterval(() => {
      const hasRemoteUser = webrtcConnectionRef.current.hasRemoteUserConnected();
      const currentRemoteStream = webrtcConnectionRef.current.getRemoteStream();
      
      if (hasRemoteUser && currentRemoteStream && currentRemoteStream.getTracks().length > 0) {
        // Only update if track status changed
        if (remoteStream !== currentRemoteStream) {
          setRemoteStream(null);
          setTimeout(() => setRemoteStream(currentRemoteStream), 10);
        }
      }
    }, 2000);

    return () => {
      clearInterval(trackMonitorInterval);
    };
  }, []);

  return remoteStream;
}
