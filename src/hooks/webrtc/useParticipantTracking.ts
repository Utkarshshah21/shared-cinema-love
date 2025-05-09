import { useState } from 'react';
import { RemoteParticipant } from './types';
import { useToast } from '@/components/ui/use-toast';

export function useParticipantTracking() {
  const { toast } = useToast();
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  
  // Update remote participants list from signaling data
  const updateRemoteParticipantsList = (senderId: string, metadata: any, connectionState: string) => {
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

  return {
    remoteParticipants,
    updateRemoteParticipantsList,
    removeParticipant
  };
}
