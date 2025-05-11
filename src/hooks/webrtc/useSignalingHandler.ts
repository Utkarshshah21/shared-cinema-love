import { useRef, useEffect } from 'react';
import { SignalingData } from './types';

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
      if (processedMessages.current.size > 500) { // Reduced from 1000 for more frequent clearing
        processedMessages.current = new Set();
      }
    }, 30000); // More frequent clearing (reduced from 60000ms)
    
    return () => clearInterval(interval);
  }, []);

  // Handle signaling messages
  const handleSignalingMessage = (data: SignalingData) => {
    if (!webrtcConnectionRef.current) return;
    
    try {
      // Create a more unique message ID to better detect duplicates
      const messageId = `${data.type}-${data.sender}-${data.timestamp || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Add some randomness to avoid duplicate detection issues
      if (processedMessages.current.has(messageId) && data.type !== 'presence') {
        console.log(`Skipping duplicate message: ${data.type} from ${data.sender}`);
        return;
      }
      
      // Mark as processed (except for presence messages which we want to process every time)
      if (data.type !== 'presence') {
        processedMessages.current.add(messageId);
      }
      
      console.log(`Processing signaling message: ${data.type} from ${data.sender}`);
      
      switch (data.type) {
        case 'offer':
          console.log(`Received offer from ${data.sender}`);
          webrtcConnectionRef.current.handleOffer(
            { type: 'offer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'answer':
          console.log(`Received answer from ${data.sender}`);
          webrtcConnectionRef.current.handleAnswer(
            { type: 'answer', sdp: data.sdp } as RTCSessionDescriptionInit,
            data.sender,
            data.metadata
          );
          break;
        case 'ice-candidate':
          if (data.candidate) {
            console.log(`Received ICE candidate from ${data.sender}`);
            webrtcConnectionRef.current.handleIceCandidate(data.candidate, data.sender);
          }
          break;
        case 'presence':
          // Always process presence messages to keep user status updated
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
          // More aggressive handling of renegotiation requests for screen sharing
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
