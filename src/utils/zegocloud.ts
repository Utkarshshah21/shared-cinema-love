
// ZegoCloud SDK wrapper for WebRTC functionality
import { ZegoExpressEngine } from 'zego-express-engine-webrtc';
import { v4 as uuidv4 } from 'uuid';
import { toast } from '@/components/ui/use-toast';

// Types for ZegoCloud integration
export interface ZegoUser {
  userID: string;
  userName: string;
}

export interface ZegoRoomConfig {
  appID: number;
  server: string;
  roomID: string;
  token: string;
  user: ZegoUser;
}

// ZegoCloud service class
export class ZegoCloudService {
  private static instance: ZegoCloudService;
  private zegoEngine: any = null; // Using any to avoid type checking issues
  private appID: number = 0;
  private server: string = '';
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private roomID: string = '';
  private user: ZegoUser | null = null;
  private isInRoom: boolean = false;
  private onStreamUpdateCallback: ((streams: Map<string, MediaStream>) => void) | null = null;
  private onRoomStateChangeCallback: ((state: string) => void) | null = null;
  private connectionRetryCount: number = 0;
  private maxRetries: number = 3;

  public static getInstance(): ZegoCloudService {
    if (!ZegoCloudService.instance) {
      ZegoCloudService.instance = new ZegoCloudService();
    }
    return ZegoCloudService.instance;
  }

  // Initialize the ZegoCloud engine
  public async init(config: ZegoRoomConfig): Promise<boolean> {
    try {
      this.appID = config.appID;
      this.server = config.server;
      this.roomID = config.roomID;
      this.user = config.user;
      this.connectionRetryCount = 0;

      // Clean up any existing instance before creating a new one
      if (this.zegoEngine) {
        try {
          this.zegoEngine.off('roomStateUpdate');
          this.zegoEngine.off('roomStreamUpdate');
          this.zegoEngine.off('roomUserUpdate');
          this.zegoEngine = null;
        } catch (e) {
          console.warn("Error cleaning up existing ZegoEngine:", e);
        }
      }

      // Create ZegoExpressEngine instance
      this.zegoEngine = new ZegoExpressEngine(this.appID, this.server);
      console.log("ZegoExpressEngine created with appID:", this.appID);
      
      // Set up event handlers with better error handling
      this.setupEventHandlers();

      return true;
    } catch (error) {
      console.error("Failed to initialize ZegoCloudService:", error);
      toast({
        title: "Connection Error",
        description: "Failed to initialize video call service. Will retry automatically.",
        variant: "destructive"
      });
      
      // Retry initialization after a delay if not exceeded max retries
      if (this.connectionRetryCount < this.maxRetries) {
        this.connectionRetryCount++;
        console.log(`Retrying initialization (${this.connectionRetryCount}/${this.maxRetries})...`);
        setTimeout(() => {
          this.init(config);
        }, 2000);
      }
      
      return false;
    }
  }

  // Set up all event handlers
  private setupEventHandlers() {
    if (!this.zegoEngine) return;

    this.zegoEngine.on('roomStateUpdate', (roomID: string, state: string) => {
      console.log(`Room state update: ${state} for room ${roomID}`);
      if (this.onRoomStateChangeCallback) {
        this.onRoomStateChangeCallback(state);
      }
      
      // Auto-reconnect if disconnected unexpectedly
      if (state === 'DISCONNECTED' && this.isInRoom && this.connectionRetryCount < this.maxRetries) {
        this.connectionRetryCount++;
        console.log(`Connection lost. Attempting to reconnect (${this.connectionRetryCount}/${this.maxRetries})...`);
        this.reconnect();
      }
    });

    this.zegoEngine.on('roomStreamUpdate', (roomID: string, updateType: string, streamList: any[]) => {
      console.log(`Room stream update: ${updateType}`, streamList);
      
      if (updateType === 'ADD') {
        // New streams added
        streamList.forEach(stream => {
          this.zegoEngine?.startPlayingStream(stream.streamID, {
            video: true,
            audio: true
          }).then((remoteStream: MediaStream) => {
            console.log(`Started playing stream: ${stream.streamID}`);
            this.remoteStreams.set(stream.userID, remoteStream);
            if (this.onStreamUpdateCallback) {
              this.onStreamUpdateCallback(this.remoteStreams);
            }
          }).catch((err: any) => {
            console.error(`Failed to play stream ${stream.streamID}:`, err);
          });
        });
      } else if (updateType === 'DELETE') {
        // Streams removed
        streamList.forEach(stream => {
          try {
            this.zegoEngine?.stopPlayingStream(stream.streamID);
            this.remoteStreams.delete(stream.userID);
            console.log(`Stopped playing stream: ${stream.streamID}`);
            if (this.onStreamUpdateCallback) {
              this.onStreamUpdateCallback(this.remoteStreams);
            }
          } catch (err) {
            console.error(`Error stopping stream ${stream.streamID}:`, err);
          }
        });
      }
    });

    this.zegoEngine.on('roomUserUpdate', (roomID: string, updateType: string, userList: any[]) => {
      console.log(`Room user update: ${updateType}`, userList);
      
      // Toast notification when users join or leave
      if (updateType === 'ADD' && userList.length > 0) {
        toast({
          title: "User joined",
          description: `${userList[0].userName} has joined the room`,
        });
      } else if (updateType === 'DELETE' && userList.length > 0) {
        toast({
          title: "User left",
          description: `${userList[0].userName} has left the room`,
        });
      }
    });

    // Add network quality monitoring
    this.zegoEngine.on('roomNetworkQuality', (userId: string, upQuality: number, downQuality: number) => {
      console.log(`Network quality for user ${userId}: Upload=${upQuality}, Download=${downQuality}`);
      
      // Show toast on poor connection
      if ((upQuality > 3 || downQuality > 3) && this.user?.userID === userId) {
        toast({
          title: "Poor connection",
          description: "Your network connection quality is degraded",
          variant: "warning"
        });
      }
    });

    console.log("ZegoCloud event handlers setup complete");
  }

  // Attempt to reconnect to the room
  private async reconnect() {
    try {
      if (!this.zegoEngine || !this.user || !this.roomID) return;
      
      console.log("Attempting to reconnect...");
      toast({
        title: "Reconnecting",
        description: "Attempting to reconnect to the room...",
      });
      
      // Generate a token (in production this would come from server)
      const token = `${this.appID}-${this.user.userID}-${Date.now()}`;
      
      await this.zegoEngine.loginRoom(this.roomID, token, {
        userID: this.user.userID,
        userName: this.user.userName
      }, { userUpdate: true });
      
      this.isInRoom = true;
      this.connectionRetryCount = 0; // Reset retry count on successful reconnection
      console.log(`Reconnected to room: ${this.roomID}`);
      
      toast({
        title: "Reconnected",
        description: `Successfully reconnected to the room`,
      });
      
      // Restart local stream if needed
      if (this.localStream) {
        await this.startPublishingStream();
      }
    } catch (error) {
      console.error("Reconnection failed:", error);
      
      // Try again if we haven't exceeded max retries
      if (this.connectionRetryCount < this.maxRetries) {
        setTimeout(() => this.reconnect(), 3000);
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not reconnect after multiple attempts",
          variant: "destructive"
        });
      }
    }
  }

  // Join a room and start publishing local stream
  public async joinRoom(token: string): Promise<boolean> {
    if (!this.zegoEngine || !this.user) {
      console.error("ZegoExpressEngine not initialized or user not set");
      return false;
    }

    try {
      // Join the room with retry logic
      const joinWithRetry = async (attempt: number = 1): Promise<boolean> => {
        try {
          await this.zegoEngine.loginRoom(this.roomID, token, {
            userID: this.user!.userID,
            userName: this.user!.userName
          }, { userUpdate: true });
          
          this.isInRoom = true;
          this.connectionRetryCount = 0; // Reset retry counter on successful join
          console.log(`Joined room: ${this.roomID}`);
          
          toast({
            title: "Connected",
            description: `You've joined room ${this.roomID}`,
          });
          
          return true;
        } catch (error) {
          console.error(`Join room attempt ${attempt} failed:`, error);
          
          if (attempt < this.maxRetries) {
            console.log(`Retrying join (${attempt}/${this.maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return joinWithRetry(attempt + 1);
          }
          
          toast({
            title: "Connection Error",
            description: "Failed to join the room after multiple attempts",
            variant: "destructive"
          });
          
          return false;
        }
      };
      
      return await joinWithRetry();
    } catch (error) {
      console.error("Failed to join room:", error);
      toast({
        title: "Connection Error",
        description: "Failed to join the room",
        variant: "destructive"
      });
      return false;
    }
  }

  // Start publishing local stream
  public async startPublishingStream(enableVideo: boolean = true, enableAudio: boolean = true): Promise<MediaStream | null> {
    if (!this.zegoEngine || !this.isInRoom) {
      console.error("Not in room or engine not initialized");
      return null;
    }

    try {
      // Generate a unique stream ID with more uniqueness to prevent collisions
      const streamID = `${this.roomID}_${this.user?.userID || uuidv4()}_${Date.now()}`;
      
      // Start publishing with better error handling
      try {
        this.localStream = await this.zegoEngine.createStream({
          camera: {
            video: enableVideo,
            audio: enableAudio
          }
        });

        // Make sure we actually got tracks
        if (this.localStream && 
            (enableVideo && this.localStream.getVideoTracks().length === 0) || 
            (enableAudio && this.localStream.getAudioTracks().length === 0)) {
          console.warn("Failed to get all requested media tracks");
        }

        await this.zegoEngine.startPublishingStream(streamID, this.localStream);
        
        console.log("Started publishing stream:", streamID);
        return this.localStream;
      } catch (err) {
        console.error("Error creating or publishing stream:", err);
        
        // Try with just audio if video fails
        if (enableVideo) {
          console.log("Retrying with audio only...");
          this.localStream = await this.zegoEngine.createStream({
            camera: {
              video: false,
              audio: enableAudio
            }
          });
          
          await this.zegoEngine.startPublishingStream(streamID, this.localStream);
          toast({
            title: "Limited Media Access",
            description: "Your camera couldn't be accessed. Connected with audio only.",
            variant: "warning"
          });
          
          return this.localStream;
        }
        throw err;
      }
    } catch (error) {
      console.error("Failed to start publishing stream:", error);
      toast({
        title: "Stream Error",
        description: "Failed to start your video stream. Please check your camera and microphone permissions.",
        variant: "destructive"
      });
      return null;
    }
  }

  // Stop publishing local stream
  public stopPublishingStream(): void {
    if (!this.zegoEngine || !this.localStream) return;

    try {
      // Generate the same stream ID pattern
      const streamID = `${this.roomID}_${this.user?.userID || ''}_${Date.now()}`;
      this.zegoEngine.stopPublishingStream(streamID);
      this.zegoEngine.destroyStream(this.localStream);
      this.localStream = null;
      console.log("Stopped publishing stream");
    } catch (error) {
      console.error("Error stopping stream:", error);
    }
  }

  // Leave the room
  public leaveRoom(): void {
    if (!this.zegoEngine || !this.isInRoom) return;

    try {
      // Stop all streams first
      if (this.localStream) {
        this.stopPublishingStream();
      }

      // Stop playing all remote streams
      this.remoteStreams.forEach((_, userId) => {
        const streamID = `${this.roomID}_${userId}`;
        try {
          this.zegoEngine?.stopPlayingStream(streamID);
        } catch (e) {
          console.warn(`Error stopping stream for user ${userId}:`, e);
        }
      });
      
      this.remoteStreams.clear();
      
      // Leave the room
      this.zegoEngine.logoutRoom(this.roomID);
      this.isInRoom = false;
      console.log("Left room:", this.roomID);

      toast({
        title: "Disconnected",
        description: "You've left the room",
      });
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }

  // Toggle camera
  public async toggleCamera(enable: boolean): Promise<void> {
    if (!this.zegoEngine || !this.localStream) return;

    try {
      // Using the correct method for muting video
      this.zegoEngine.mutePublishStreamVideo(this.localStream, !enable);
      console.log(`Camera ${enable ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error("Error toggling camera:", error);
      toast({
        title: "Camera Error",
        description: `Failed to ${enable ? 'enable' : 'disable'} camera`,
        variant: "destructive"
      });
    }
  }

  // Toggle microphone
  public async toggleMicrophone(enable: boolean): Promise<void> {
    if (!this.zegoEngine || !this.localStream) return;

    try {
      // Using the correct method for muting audio
      this.zegoEngine.mutePublishStreamAudio(this.localStream, !enable);
      console.log(`Microphone ${enable ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error("Error toggling microphone:", error);
      toast({
        title: "Microphone Error",
        description: `Failed to ${enable ? 'enable' : 'disable'} microphone`,
        variant: "destructive"
      });
    }
  }

  // Get local stream
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Get remote streams
  public getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  // Register callback for remote stream updates
  public onStreamUpdate(callback: (streams: Map<string, MediaStream>) => void) {
    this.onStreamUpdateCallback = callback;
  }

  // Register callback for room state changes
  public onRoomStateChange(callback: (state: string) => void) {
    this.onRoomStateChangeCallback = callback;
  }

  // Function to update display name
  public updateDisplayName(displayName: string): void {
    if (!this.user) return;
    this.user.userName = displayName;
    console.log(`Updated display name to: ${displayName}`);
  }

  // Cleanup and destroy ZegoCloud engine
  public destroy(): void {
    if (this.isInRoom) {
      this.leaveRoom();
    }

    if (this.zegoEngine) {
      // Use custom destroy method instead of relying on ZegoExpressEngine.destroy
      try {
        this.zegoEngine.off('roomStateUpdate');
        this.zegoEngine.off('roomStreamUpdate');
        this.zegoEngine.off('roomUserUpdate');
        this.zegoEngine.off('roomNetworkQuality');
        // Set to null since destroy may not exist
        this.zegoEngine = null;
      } catch (e) {
        console.error("Error during engine cleanup:", e);
      }
      console.log("ZegoExpressEngine destroyed");
    }
    
    ZegoCloudService.instance = null as any;
  }
}
