
import { useRef } from 'react';
import { SignalingData } from '@/utils/webrtc';

export function useSignalingHandler(
  webrtcConnectionRef: React.MutableRefObject<any>,
  updateRemoteParticipantsList: (senderId: string, metadata: any, connectionState: string) => void,
  removeParticipant: (participantId: string) => void,
  userId: string,
  connectionState: string
) {
  // Handle signaling messages
  const handleSignalingMessage = (data: SignalingData) => {
    if (!webrtcConnectionRef.current) return;

    try {
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
            webrtcConnectionRef.current.handleIceCandidate(data.candidate);
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

  return { handleSignalingMessage };
}
