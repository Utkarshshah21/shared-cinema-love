import { useRef, useEffect } from 'react';
import { SignalingData } from '@/utils/webrtc';

export function useSignalingHandler(
  webrtcConnectionRef: React.MutableRefObject<any>,
  updateRemoteParticipantsList: (senderId: string, metadata: any, connectionState: string) => void,
  removeParticipant: (participantId: string) => void,
  userId: string,
  connectionState: string
) {
  // Keep track of processed messages to avoid duplicates
  const processedMessages = useRef<Set<string>>(new Set());
  
  // Clear processed messages periodically to avoid memory leaks
  useEffect(() => {
    const interval = setInterval(() => {
      if (processedMessages.current.size > 1000) {
        processedMessages.current = new Set();
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle signaling messages
  const handleSignalingMessage = (data: SignalingData) => {
    if (!webrtcConnectionRef.current) return;
    
    try {
      // Create a message ID to detect duplicates
      const messageId = `${data.type}-${data.sender}-${data.timestamp || Date.now()}`;
      
      // Skip if we've already processed this message
      if (processedMessages.current.has(messageId)) {
        return;
      }
      
      // Mark as processed
      processedMessages.current.add(messageId);
      
      console.log(`Processing signaling message: ${data.type} from ${data.sender}`);
      
      switch (data.type) {
        case 'offer':
          webrtcConnectionRef.current.handleOffer(
            { type: 'offer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'answer':
          webrtcConnectionRef.current.handleAnswer(
            { type: 'answer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'ice-candidate':
          if (data.candidate) {
            webrtcConnectionRef.current.handleIceCandidate(data.candidate, data.sender);
          }
          break;
        case 'presence':
          webrtcConnectionRef.current.handlePresence(data.sender, data.metadata);
          // Also update participants list from presence messages
          if (data.metadata && data.sender !== userId) {
            updateRemoteParticipantsList(data.sender, data.metadata, connectionState);
          }
          break;
        case 'status-update':
          webrtcConnectionRef.current.handleStatusUpdate(data.sender, data.metadata);
          if (data.metadata && data.sender !== userId) {
            updateRemoteParticipantsList(data.sender, data.metadata, connectionState);
          }
          break;
        case 'participant-left':
          if (data.sender !== userId) {
            console.log(`Participant left: ${data.sender}`);
            removeParticipant(data.sender);
            webrtcConnectionRef.current.handleParticipantLeft(data.sender);
          }
          break;
        case 'renegotiate':
          // Handle renegotiation requests (important for screen sharing)
          if (data.sender !== userId) {
            console.log(`Renegotiation requested by: ${data.sender}`);
            webrtcConnectionRef.current.handleRenegotiationRequest(data.sender);
          }
          break;
        default:
          console.log('Unknown signaling message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  };

  return { handleSignalingMessage };
}
