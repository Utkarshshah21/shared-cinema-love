
import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { ZegoCloudService } from '@/utils/zegocloud';

// Configuration type for ZegoCloud
export interface ZegoCloudConfig {
  appID?: number;
  appSign?: string;
  server?: string;
  token?: string;
  roomID: string;
  userID?: string;
  userName?: string;
  serverSecret?: string;
}

// Default ZegoCloud credentials - these will be used if none are provided
const DEFAULT_CREDENTIALS = {
  appID: 1481071172,
  appSign: '2a3a63461704e7438ee9a307f03f442e71689240e360afaa27861e7a0b96c944',
  serverSecret: '10859fa006c38a78077b5f1e919134d1'
};

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

  // Generate a token for the room
  const generateToken = (appID: number, serverSecret: string, roomID: string, userID: string): string => {
    // In a production environment, this should be done on the server side
    // For demo purposes, we're using a static token
    return config.appSign || DEFAULT_CREDENTIALS.appSign;
  };

  // Initialize the ZegoCloud service when the component mounts
  useEffect(() => {
    const initializeZegoCloud = async () => {
      const appID = config.appID || DEFAULT_CREDENTIALS.appID;
      const token = config.token || generateToken(
        appID,
        config.serverSecret || DEFAULT_CREDENTIALS.serverSecret,
        config.roomID,
        userID
      );

      const initialized = await zegoService.init({
        appID: appID,
        server: config.server || 'wss://webliveroom-test.zego.im/ws',
        roomID: config.roomID,
        token: token,
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
  }, [config.roomID, userID, userName]);

  // Connect to the room
  const connect = async () => {
    const token = config.token || generateToken(
      config.appID || DEFAULT_CREDENTIALS.appID,
      config.serverSecret || DEFAULT_CREDENTIALS.serverSecret,
      config.roomID,
      userID
    );
    
    const joined = await zegoService.joinRoom(token);
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
    startLocalStream,
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
