
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
      
      // Force a fresh update of the remote stream to trigger UI re-render
      setRemoteStream(null); // Clear first
      setTimeout(() => setRemoteStream(updatedStream), 10); // Set after a small delay
    };
    
    webrtcConnectionRef.current.onRemoteStreamUpdate(handleRemoteStreamUpdate);
    
    // Create a robust track monitor to detect and fix track visibility issues
    const trackMonitorInterval = setInterval(() => {
      const hasRemoteUser = webrtcConnectionRef.current.hasRemoteUserConnected();
      const currentRemoteStream = webrtcConnectionRef.current.getRemoteStream();
      
      // Check if we have a remote stream with tracks but it's not showing
      if (hasRemoteUser && currentRemoteStream && currentRemoteStream.getTracks().length > 0) {
        // If track status changed or we have tracks but no visible stream, update it
        if (remoteStream !== currentRemoteStream || 
            (remoteStream === null && currentRemoteStream.getTracks().length > 0)) {
          console.log("Track monitor forcing remote stream update");
          setRemoteStream(null);
          setTimeout(() => setRemoteStream(currentRemoteStream), 10);
        }
      }
    }, 1000); // Check more frequently (reduced from 2000ms to 1000ms)

    return () => {
      clearInterval(trackMonitorInterval);
      // Remove event listeners to prevent memory leaks
      if (webrtcConnectionRef.current) {
        // Clean up any event handlers if necessary
      }
    };
  }, []);

  return remoteStream;
}
