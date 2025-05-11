
import { useRef, useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { useParticipantTracking } from './useParticipantTracking';
import { useMediaControls } from './useMediaControls';
import { useConnectionManager } from './useConnectionManager';
import { useSignalingHandler } from './useSignalingHandler';
import { useRemoteStream } from './useRemoteStream';
import { UseWebRTCReturn } from './types';
import { useWebRTC as useZegoWebRTC } from '@/utils/webrtc';

// Re-use the ZegoCloud implementation
export function useWebRTC(roomId: string, displayName: string = "User"): UseWebRTCReturn {
  return useZegoWebRTC(roomId, displayName);
}

// Re-export types
export type { RemoteParticipant, UseWebRTCReturn } from './types';
