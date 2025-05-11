
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
  private zegoEngine: ZegoExpressEngine | null = null;
  private appID: number = 0;
  private server: string = '';
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private roomID: string = '';
  private user: ZegoUser | null = null;
  private isInRoom: boolean = false;
  private onStreamUpdateCallback: ((streams: Map<string, MediaStream>) => void) | null = null;
  private onRoomStateChangeCallback: ((state: string) => void) | null = null;

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

      // Create ZegoExpressEngine instance if it doesn't exist
      if (!this.zegoEngine) {
        this.zegoEngine = new ZegoExpressEngine(this.appID, this.server);
        
        // Set up event handlers
        this.zegoEngine.on('roomStateUpdate', (roomID: string, state: string) => {
          console.log(`Room state update: ${state} for room ${roomID}`);
          if (this.onRoomStateChangeCallback) {
            this.onRoomStateChangeCallback(state);
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
                this.remoteStreams.set(stream.userID, remoteStream);
                if (this.onStreamUpdateCallback) {
                  this.onStreamUpdateCallback(this.remoteStreams);
                }
              });
            });
          } else if (updateType === 'DELETE') {
            // Streams removed
            streamList.forEach(stream => {
              this.zegoEngine?.stopPlayingStream(stream.streamID);
              this.remoteStreams.delete(stream.userID);
              if (this.onStreamUpdateCallback) {
                this.onStreamUpdateCallback(this.remoteStreams);
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

        console.log("ZegoExpressEngine created successfully");
      }

      return true;
    } catch (error) {
      console.error("Failed to initialize ZegoCloudService:", error);
      toast({
        title: "Connection Error",
        description: "Failed to initialize video call service",
        variant: "destructive"
      });
      return false;
    }
  }

  // Join a room and start publishing local stream
  public async joinRoom(token: string): Promise<boolean> {
    if (!this.zegoEngine || !this.user) {
      console.error("ZegoExpressEngine not initialized or user not set");
      return false;
    }

    try {
      // Join the room
      await this.zegoEngine.loginRoom(this.roomID, token, {
        userID: this.user.userID,
        userName: this.user.userName
      }, { userUpdate: true });

      this.isInRoom = true;
      console.log(`Joined room: ${this.roomID}`);

      toast({
        title: "Connected",
        description: `You've joined room ${this.roomID}`,
      });

      return true;
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
      // Generate a unique stream ID
      const streamID = `${this.roomID}_${this.user?.userID || uuidv4()}`;
      
      // Start publishing
      this.localStream = await this.zegoEngine.createStream({
        camera: {
          video: enableVideo,
          audio: enableAudio
        }
      });

      await this.zegoEngine.startPublishingStream(streamID, this.localStream);
      
      console.log("Started publishing stream:", streamID);
      return this.localStream;
    } catch (error) {
      console.error("Failed to start publishing stream:", error);
      toast({
        title: "Stream Error",
        description: "Failed to start your video stream",
        variant: "destructive"
      });
      return null;
    }
  }

  // Stop publishing local stream
  public stopPublishingStream(): void {
    if (!this.zegoEngine || !this.localStream) return;

    try {
      // Generate the same stream ID
      const streamID = `${this.roomID}_${this.user?.userID || ''}`;
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
        this.zegoEngine?.stopPlayingStream(streamID);
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
      await this.zegoEngine.enableCamera(this.localStream, enable);
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
      await this.zegoEngine.enableAudio(this.localStream, enable);
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

  // Cleanup and destroy ZegoCloud engine
  public destroy(): void {
    if (this.isInRoom) {
      this.leaveRoom();
    }

    if (this.zegoEngine) {
      this.zegoEngine.destroy();
      this.zegoEngine = null;
      console.log("ZegoExpressEngine destroyed");
    }
    
    ZegoCloudService.instance = null as any;
  }
}
