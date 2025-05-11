
// Re-export from utils/webrtc.ts for backward compatibility
import { useWebRTC as useWebRTCInternal, UseWebRTCReturn, RemoteParticipant } from '@/utils/webrtc';

// Re-export types
export type { UseWebRTCReturn, RemoteParticipant };

// Re-export the hook
export const useWebRTC = useWebRTCInternal;
