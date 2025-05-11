import { useState, useEffect } from 'react';
import { RemoteParticipant } from './types';
import { useToast } from '@/components/ui/use-toast';

export function useParticipantTracking() {
  const { toast } = useToast();
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  
  // Update remote participants list from signaling data
  const updateRemoteParticipantsList = (senderId: string, metadata: any, connectionState: string) => {
    if (!senderId) return; // Skip if no sender ID
    
    setRemoteParticipants(prev => {
      // Check if this participant already exists
      const existingIndex = prev.findIndex(p => p.userId === senderId);
      
      const updatedParticipant: RemoteParticipant = {
        userId: senderId,
        displayName: metadata?.displayName || "User " + senderId.slice(0, 4),
        isCameraOn: metadata?.isCameraOn || false,
        isMicOn: metadata?.isMicOn || false, 
        isScreenSharing: metadata?.isScreenSharing || false,
        connectionState: connectionState,
        joinedAt: Date.now(),
        id: senderId, // Set id to senderId for compatibility
        stream: null  // Initialize stream as null
      };

      // If participant exists, update their info
      if (existingIndex >= 0) {
        const updatedParticipants = [...prev];
        updatedParticipants[existingIndex] = {
          ...updatedParticipants[existingIndex],
          ...updatedParticipant,
          // Keep the existing stream if it exists
          stream: updatedParticipants[existingIndex].stream || null
        };
        return updatedParticipants;
      } 
      
      // Otherwise, add as new participant
      toast({
        title: "New participant joined",
        description: `${metadata?.displayName || "A user"} has joined the room`,
      });
      
      console.log(`Adding new participant: ${senderId} - ${metadata?.displayName}`);
      return [...prev, updatedParticipant];
    });
  };

  // Remove a participant from the list when they leave
  const removeParticipant = (participantId: string) => {
    if (!participantId) return; // Skip if no participant ID
    
    setRemoteParticipants(prev => {
      const participant = prev.find(p => p.userId === participantId);
      if (participant) {
        toast({
          title: "Participant left",
          description: `${participant.displayName} has left the room`,
        });
        console.log(`Removing participant: ${participantId} - ${participant.displayName}`);
      }
      return prev.filter(p => p.userId !== participantId);
    });
  };

  // Clean up stale participants
  useEffect(() => {
    const staleCheckInterval = setInterval(() => {
      const now = Date.now();
      setRemoteParticipants(prev => {
        // Only remove participants that haven't updated in the last 45 seconds (increased from 30s)
        return prev.filter(participant => {
          const isStale = now - participant.joinedAt > 45000;
          if (isStale) {
            console.log(`Removing stale participant: ${participant.userId}`);
          }
          return !isStale;
        });
      });
    }, 15000); // Check less frequently (increased from 10000ms)
    
    return () => clearInterval(staleCheckInterval);
  }, []);

  return {
    remoteParticipants,
    updateRemoteParticipantsList,
    removeParticipant
  };
}
