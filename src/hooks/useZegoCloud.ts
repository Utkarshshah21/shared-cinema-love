
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ZegoCloudService, ZegoUser } from '@/utils/zegocloud';
import { useToast } from '@/components/ui/use-toast';

// Configuration type for ZegoCloud
export interface ZegoCloudConfig {
  appID: number;
  server?: string;
  token: string;
  roomID: string;
  userID?: string;
  userName?: string;
}

export function useZegoCloud(config: ZegoCloudConfig) {
  const { toast } = useToast();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [roomState, setRoomState] = useState<string>('DISCONNECTED');
  const [hasRemoteUsers, setHasRemoteUsers] = useState<boolean>(false);

  // Generate a user ID that persists in the session
  const userID = useRef<string>(
    (() => {
      const existingId = sessionStorage.getItem(`zego_user_id_${config.roomID}`);
      if (existingId) return existingId;
      
      const newId = config.userID || uuidv4();
      sessionStorage.setItem(`zego_user_id_${config.roomID}`, newId);
      return newId;
    })()
  ).current;

  const userName = useRef<string>(config.userName || `User_${userID.slice(0, 4)}`).current;

  // Get the ZegoCloud service instance
  const zegoService = ZegoCloudService.getInstance();

  // Initialize the ZegoCloud service when the component mounts
  useEffect(() => {
    const initializeZegoCloud = async () => {
      const initialized = await zegoService.init({
        appID: config.appID,
        server: config.server || 'wss://webliveroom-test.zego.im/ws',
        roomID: config.roomID,
        token: config.token,
        user: {
          userID: userID,
          userName: userName
        }
      });

      if (initialized) {
        console.log("ZegoCloud service initialized successfully");
        
        // Register stream update callback
        zegoService.onStreamUpdate((streams) => {
          setRemoteStreams(new Map(streams));
          setHasRemoteUsers(streams.size > 0);
        });
        
        // Register room state change callback
        zegoService.onRoomStateChange((state) => {
          setRoomState(state);
          setIsConnected(state === 'CONNECTED');
        });
      }
    };

    initializeZegoCloud();

    // Cleanup when component unmounts
    return () => {
      zegoService.destroy();
    };
  }, [config.appID, config.roomID, config.token, userID, userName]);

  // Connect to the room
  const connect = async () => {
    const joined = await zegoService.joinRoom(config.token);
    if (joined) {
      setIsConnected(true);
    }
    return joined;
  };

  // Disconnect from the room
  const disconnect = () => {
    zegoService.leaveRoom();
    setIsConnected(false);
    setLocalStream(null);
    setRemoteStreams(new Map());
    setHasRemoteUsers(false);
    setIsCameraOn(false);
    setIsMicOn(false);
  };

  // Start local stream with camera and microphone
  const startLocalStream = async (enableCamera: boolean = true, enableMicrophone: boolean = true) => {
    const stream = await zegoService.startPublishingStream(enableCamera, enableMicrophone);
    if (stream) {
      setLocalStream(stream);
      setIsCameraOn(enableCamera);
      setIsMicOn(enableMicrophone);
    }
    return stream !== null;
  };

  // Toggle camera
  const toggleCamera = async () => {
    const newState = !isCameraOn;
    
    // If we need to turn camera on but don't have a local stream yet
    if (newState && !localStream) {
      const success = await startLocalStream(true, isMicOn);
      return success;
    }
    
    await zegoService.toggleCamera(newState);
    setIsCameraOn(newState);
    return true;
  };

  // Toggle microphone
  const toggleMic = async () => {
    const newState = !isMicOn;
    
    // If we need to turn mic on but don't have a local stream yet
    if (newState && !localStream) {
      const success = await startLocalStream(isCameraOn, true);
      return success;
    }
    
    await zegoService.toggleMicrophone(newState);
    setIsMicOn(newState);
    return true;
  };

  // Clean up when component unmounts
  useEffect(() => {
    const handleBeforeUnload = () => {
      zegoService.leaveRoom();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      zegoService.leaveRoom();
    };
  }, []);

  return {
    connect,
    disconnect,
    toggleCamera,
    toggleMic,
    localStream,
    remoteStreams,
    isCameraOn,
    isMicOn,
    isConnected,
    roomState,
    hasRemoteUsers,
    userID,
    userName
  };
}
