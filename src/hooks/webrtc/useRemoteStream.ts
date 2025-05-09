
import { useState, useEffect } from 'react';

export function useRemoteStream(webrtcConnectionRef: React.MutableRefObject<any>) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Set up the remote stream
  useEffect(() => {
    if (!webrtcConnectionRef.current) return;
    
    const remoteMediaStream = webrtcConnectionRef.current.getRemoteStream();
    setRemoteStream(remoteMediaStream);

    // Force a re-render of the remote stream if tracks are added
    const trackMonitorInterval = setInterval(() => {
      const hasRemoteUser = webrtcConnectionRef.current.hasRemoteUserConnected();
      
      if (hasRemoteUser && remoteMediaStream.getTracks().length > 0) {
        setRemoteStream(null);
        setTimeout(() => setRemoteStream(remoteMediaStream), 10);
      }
    }, 1000);

    return () => {
      clearInterval(trackMonitorInterval);
    };
  }, []);

  return remoteStream;
}
