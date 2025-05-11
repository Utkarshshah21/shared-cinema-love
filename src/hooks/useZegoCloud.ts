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
  const [connectionAttempts, setConnectionAttempts] = useState<number>(0);
  const maxConnectionAttempts = 3;

  // Generate a user ID that persists in localStorage for better persistence
  const userID = useRef<string>(
    (() => {
      const existingId = localStorage.getItem(`zego_user_id_${config.roomID}`);
      if (existingId) return existingId;
      
      const newId = config.userID || uuidv4();
      localStorage.setItem(`zego_user_id_${config.roomID}`, newId);
      return newId;
    })()
  ).current;

  const userName = useRef<string>(config.userName || `User_${userID.slice(0, 4)}`).current;

  // Get the ZegoCloud service instance
  const zegoService = ZegoCloudService.getInstance();

  // Generate a token for the room - in production this should be server-side
  const generateToken = (appID: number, serverSecret: string, roomID: string, userID: string): string => {
    // Create a token with timestamp to make it more unique
    const timestamp = Date.now().toString();
    const tokenBase = `${appID}-${userID}-${roomID}-${timestamp}`;
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

      console.log("Initializing ZegoCloud with:", { 
        appID, 
        roomID: config.roomID, 
        userID,
        userName 
      });

      const initialized = await zegoService.init({
        appID: appID,
        server: config.server || 'wss://webliveroom1-api.zego.im/ws',  // Updated to more reliable server
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
          console.log("Remote streams updated:", streams.size > 0 ? 
            `${streams.size} streams available` : "No streams");
          setRemoteStreams(new Map(streams));
          setHasRemoteUsers(streams.size > 0);
        });
        
        // Register room state change callback
        zegoService.onRoomStateChange((state) => {
          console.log("Room state changed to:", state);
          setRoomState(state);
          setIsConnected(state === 'CONNECTED');
          
          // Reset connection attempts on successful connection
          if (state === 'CONNECTED') {
            setConnectionAttempts(0);
          }
        });
      } else {
        // Handle failed initialization with retry mechanism
        setConnectionAttempts(prev => {
          const newCount = prev + 1;
          if (newCount < maxConnectionAttempts) {
            const retryDelay = Math.pow(2, newCount) * 1000; // Exponential backoff
            console.log(`Initialization failed. Retrying in ${retryDelay/1000} seconds... (${newCount}/${maxConnectionAttempts})`);
            
            toast({
              title: "Connection Issue",
              description: `Trying to reconnect (${newCount}/${maxConnectionAttempts})...`,
              duration: 3000,
            });
            
            setTimeout(() => initializeZegoCloud(), retryDelay);
          } else {
            console.error("Failed to initialize ZegoCloud after maximum attempts");
            toast({
              title: "Connection Failed",
              description: "Please check your internet connection and reload the page",
              variant: "destructive",
            });
          }
          return newCount;
        });
      }
    };

    initializeZegoCloud();

    // Cleanup when component unmounts
    return () => {
      zegoService.destroy();
    };
  }, [config.roomID, userID, userName]);

  // Connect to the room with auto-retry
  const connect = async () => {
    const token = config.token || generateToken(
      config.appID || DEFAULT_CREDENTIALS.appID,
      config.serverSecret || DEFAULT_CREDENTIALS.serverSecret,
      config.roomID,
      userID
    );
    
    // Attempt to join with retries
    const attemptJoin = async (attempt = 0): Promise<boolean> => {
      try {
        const joined = await zegoService.joinRoom(token);
        if (joined) {
          setIsConnected(true);
          return true;
        }
        
        // If failed but can retry
        if (attempt < maxConnectionAttempts - 1) {
          const retryDelay = Math.pow(2, attempt) * 1000;
          console.log(`Join failed. Retrying in ${retryDelay/1000}s (${attempt+1}/${maxConnectionAttempts})`);
          
          toast({
            title: "Joining Failed",
            description: `Retrying in ${retryDelay/1000} seconds...`,
            duration: 2000,
          });
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return attemptJoin(attempt + 1);
        }
        
        return false;
      } catch (error) {
        console.error(`Join attempt ${attempt+1} failed:`, error);
        
        if (attempt < maxConnectionAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return attemptJoin(attempt + 1);
        }
        
        return false;
      }
    };
    
    return attemptJoin();
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
    try {
      const stream = await zegoService.startPublishingStream(enableCamera, enableMicrophone);
      if (stream) {
        setLocalStream(stream);
        setIsCameraOn(enableCamera);
        setIsMicOn(enableMicrophone);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to start local stream:", error);
      toast({
        title: "Media Error",
        description: "Failed to access your camera or microphone. Please check permissions.",
        variant: "destructive"
      });
      return false;
    }
  };

  // Toggle camera with error handling
  const toggleCamera = async () => {
    const newState = !isCameraOn;
    
    try {
      // If we need to turn camera on but don't have a local stream yet
      if (newState && !localStream) {
        const success = await startLocalStream(true, isMicOn);
        return success;
      }
      
      await zegoService.toggleCamera(newState);
      setIsCameraOn(newState);
      return true;
    } catch (error) {
      console.error("Error toggling camera:", error);
      toast({
        title: "Camera Error",
        description: `Failed to ${newState ? 'enable' : 'disable'} camera`,
        variant: "destructive"
      });
      return false;
    }
  };

  // Toggle microphone with error handling
  const toggleMic = async () => {
    const newState = !isMicOn;
    
    try {
      // If we need to turn mic on but don't have a local stream yet
      if (newState && !localStream) {
        const success = await startLocalStream(isCameraOn, true);
        return success;
      }
      
      await zegoService.toggleMicrophone(newState);
      setIsMicOn(newState);
      return true;
    } catch (error) {
      console.error("Error toggling microphone:", error);
      toast({
        title: "Microphone Error",
        description: `Failed to ${newState ? 'enable' : 'disable'} microphone`,
        variant: "destructive"
      });
      return false;
    }
  };

  // Handle reconnection on page visibility change (when user tabs back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // Check if we need to refresh the connection
        console.log("Page visibility changed to visible, checking connection...");
        
        if (roomState !== 'CONNECTED' && roomState !== 'CONNECTING') {
          console.log("Connection appears lost, attempting to reconnect");
          toast({
            title: "Reconnecting",
            description: "Attempting to restore your connection...",
            duration: 3000,
          });
          
          // Attempt to rejoin the room
          connect();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, roomState]);

  // Clean up when component unmounts
  useEffect(() => {
    const handleBeforeUnload = () => {
      zegoService.leaveRoom();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Add periodic heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (isConnected) {
        console.log("Connection heartbeat check...");
        
        // If we have a local stream but no room state, reconnect
        if (localStream && roomState !== 'CONNECTED') {
          console.log("Heartbeat detected disconnected state, reconnecting...");
          connect();
        }
      }
    }, 30000); // Every 30 seconds
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeatInterval);
      zegoService.leaveRoom();
    };
  }, [localStream, roomState, isConnected]);

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
