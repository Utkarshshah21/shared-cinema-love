// A simple implementation of WebRTC peer connection
import { toast } from "@/components/ui/use-toast";

// Configuration for WebRTC connections - using multiple services for better connectivity
const configuration = {
  iceServers: [
    // Google's public STUN servers
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    
    // Free TURN servers (with limited capacity)
    { 
      urls: "turn:numb.viagenie.ca",
      username: "webrtc@live.com",
      credential: "muazkh"
    },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject"
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ],
  iceCandidatePoolSize: 20, // Increased pool size for better connectivity
};

// Type for signaling data
export interface SignalingData {
  type: string;
  sdp?: string;
  candidate?: RTCIceCandidate;
  sender: string;
  target?: string;
  timestamp?: number;
  displayName?: string;
  metadata?: {
    displayName?: string;
    isCameraOn?: boolean;
    isMicOn?: boolean;
    isScreenSharing?: boolean;
    userId?: string;
  };
}

// Participant interface
export interface Participant {
  userId: string;
  displayName: string;
  connectionState: string;
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  joinedAt: number;
}

// Class to manage WebRTC connections
export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private signalingCallback: (data: SignalingData) => void;
  private userId: string;
  private roomId: string;
  private connectionState: string = "new";
  private reconnectTimer: number | null = null;
  private hasRemoteUser: boolean = false;
  private displayName: string;
  private remotePeerId: string | null = null;
  private remoteDisplayName: string | null = null;
  private onRemoteUserStatusChangeCallback: ((status: { isCameraOn: boolean, isMicOn: boolean, isScreenSharing: boolean, displayName: string, userId: string }) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: string) => void) | null = null;
  private lastActivity: number = Date.now();
  private presenceCheckInterval: number | null = null;
  private activeRemoteUsers: Set<string> = new Set();
  private iceRetryCount: number = 0;
  private maxIceRetries: number = 3;
  private useBackupSignaling: boolean = false;

  constructor(
    userId: string,
    roomId: string,
    displayName: string,
    signalingCallback: (data: SignalingData) => void
  ) {
    this.userId = userId;
    this.roomId = roomId;
    this.displayName = displayName;
    this.signalingCallback = signalingCallback;
    this.initialize();
    this.startPresenceCheck();
  }

  // Initialize WebRTC peer connection
  private initialize() {
    // Create a new RTCPeerConnection with a valid configuration
    try {
      this.peerConnection = new RTCPeerConnection(configuration);
      console.log("RTCPeerConnection created with configuration:", configuration);
    } catch (error) {
      console.error("Failed to create RTCPeerConnection:", error);
      // Try with minimal configuration if the full one fails
      const minimalConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
      try {
        this.peerConnection = new RTCPeerConnection(minimalConfig);
        console.log("RTCPeerConnection created with minimal configuration");
      } catch (fallbackError) {
        console.error("Failed to create RTCPeerConnection even with minimal config:", fallbackError);
        toast({
          title: "WebRTC Error",
          description: "Your browser may not fully support WebRTC. Try using Chrome or Firefox.",
          variant: "destructive",
        });
        return;
      }
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Generated ICE candidate", event.candidate.candidate.substring(0, 20) + "...");
        this.signalingCallback({
          type: "ice-candidate",
          candidate: event.candidate,
          sender: this.userId,
          metadata: {
            displayName: this.displayName,
            userId: this.userId,
          }
        });
      } else {
        console.log("ICE candidate generation complete");
      }
    };

    // Monitor ICE gathering state
    this.peerConnection.onicegatheringstatechange = () => {
      console.log("ICE gathering state changed to:", this.peerConnection?.iceGatheringState);
      
      // If ICE gathering fails, try a restart after a delay
      if (this.peerConnection?.iceGatheringState === "complete" && 
          this.peerConnection?.connectionState !== "connected" &&
          this.iceRetryCount < this.maxIceRetries) {
        setTimeout(() => {
          this.iceRetryCount++;
          console.log(`ICE retry attempt ${this.iceRetryCount}/${this.maxIceRetries}`);
          this.peerConnection?.restartIce();
        }, 2000);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const newState = this.peerConnection.connectionState;
      console.log("Connection state changed:", newState);
      this.connectionState = newState;
      
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(newState);
      }
      
      // Attempt reconnect if failed
      if (newState === "failed" || newState === "disconnected") {
        console.log("Connection failed or disconnected, attempting reconnect...");
        this.attemptReconnect();
      }
      
      // Reset ICE retry counter if we're connected
      if (newState === "connected") {
        this.iceRetryCount = 0;
        
        // Switch away from backup signaling if we were using it
        if (this.useBackupSignaling) {
          console.log("Connection established, no longer using backup signaling");
          this.useBackupSignaling = false;
        }
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      console.log("ICE connection state:", this.peerConnection.iceConnectionState);
      
      // If ICE connection fails, try switching to backup signaling
      if (this.peerConnection.iceConnectionState === "failed" && !this.useBackupSignaling) {
        console.log("ICE connection failed, switching to backup signaling");
        this.useBackupSignaling = true;
        this.signalingCallback({
          type: "backup-signaling",
          sender: this.userId,
          metadata: {
            displayName: this.displayName,
            userId: this.userId,
          }
        });
      }
    };

    // Add tracks from remote peer to the remote stream
    this.peerConnection.ontrack = (event) => {
      console.log("Track received:", event.track.kind);
      this.remoteStream.addTrack(event.track);
      this.hasRemoteUser = true;
      this.lastActivity = Date.now();
      
      // Add to active users
      if (this.remotePeerId) {
        this.activeRemoteUsers.add(this.remotePeerId);
      }
      
      // Update remote user status
      if (this.onRemoteUserStatusChangeCallback) {
        this.onRemoteUserStatusChangeCallback({
          isCameraOn: event.track.kind === 'video',
          isMicOn: event.track.kind === 'audio',
          isScreenSharing: false,
          displayName: this.remoteDisplayName || "Remote User",
          userId: this.remotePeerId || ""
        });
      }
      
      // Announce remote user connected via toast
      toast({
        title: `${this.remoteDisplayName || "Remote user"} connected`,
        description: "Someone joined your room",
      });
    };
    
    // Negotiate needed
    this.peerConnection.onnegotiationneeded = () => {
      console.log("Negotiation needed event triggered");
      this.createOffer();
    };
  }

  // Refresh ICE servers - can be called periodically to get fresh TURN credentials
  public refreshIceServers() {
    if (!this.peerConnection) return;
    
    console.log("Refreshing ICE servers");
    try {
      // You would typically fetch fresh TURN credentials from your server here
      // For now, we'll just restart ICE to re-try with existing servers
      this.peerConnection.restartIce();
    } catch (error) {
      console.error("Error refreshing ICE servers:", error);
    }
  }

  // Start a regular check for active participants
  private startPresenceCheck() {
    this.presenceCheckInterval = window.setInterval(() => {
      // Send presence info periodically - every 1.5 seconds for better reliability
      this.signalingCallback({
        type: "presence",
        sender: this.userId,
        metadata: {
          displayName: this.displayName,
          userId: this.userId,
          isCameraOn: this.localStream ? this.localStream.getVideoTracks().length > 0 : false,
          isMicOn: this.localStream ? this.localStream.getAudioTracks().length > 0 : false,
          isScreenSharing: this.localStream ? this.localStream.getVideoTracks().some(track => track.label.includes('screen')) : false
        }
      });
      
      // Check for stale connections (users who haven't sent updates in a while)
      const now = Date.now();
      if (now - this.lastActivity > 10000 && this.hasRemoteUser) {
        console.log("Remote user appears inactive, checking connection");
        if (this.peerConnection && (this.peerConnection.connectionState === "disconnected" || 
            this.peerConnection.connectionState === "failed")) {
          this.attemptReconnect();
        }
      }
    }, 1500);
  }

  // Register callback for remote user status changes
  public onRemoteUserStatusChange(callback: (status: { isCameraOn: boolean, isMicOn: boolean, isScreenSharing: boolean, displayName: string, userId: string }) => void) {
    this.onRemoteUserStatusChangeCallback = callback;
  }

  // Register callback for connection state changes
  public onConnectionStateChange(callback: (state: string) => void) {
    this.onConnectionStateChangeCallback = callback;
  }

  // Helper to attempt reconnection
  private attemptReconnect() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = window.setTimeout(() => {
      console.log("Attempting to reconnect...");
      // Don't completely close and recreate, just restart ICE
      if (this.peerConnection) {
        try {
          this.peerConnection.restartIce();
        } catch (e) {
          console.error("Failed to restart ICE, recreating connection", e);
          this.close();
          this.initialize();
          
          if (this.localStream) {
            this.setLocalStream(this.localStream);
          }
        }
      } else {
        this.initialize();
        
        if (this.localStream) {
          this.setLocalStream(this.localStream);
        }
      }
      
      // Send a presence message to help reconnection
      this.signalingCallback({
        type: "presence",
        sender: this.userId,
        metadata: {
          displayName: this.displayName,
          userId: this.userId,
          isCameraOn: this.localStream ? this.localStream.getVideoTracks().length > 0 : false,
          isMicOn: this.localStream ? this.localStream.getAudioTracks().length > 0 : false,
          isScreenSharing: false
        }
      });
      
      // Create a new offer
      this.createOffer();
    }, 1000);
  }

  // Set local media stream (camera/mic)
  async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    
    // Add all tracks from local stream to peer connection
    if (this.peerConnection) {
      // Remove any existing tracks first
      const senders = this.peerConnection.getSenders();
      senders.forEach((sender) => {
        this.peerConnection?.removeTrack(sender);
      });
      
      // Add new tracks
      this.localStream.getTracks().forEach((track) => {
        console.log("Adding local track to connection:", track.kind);
        this.peerConnection?.addTrack(track, this.localStream!);
      });
      
      // Send status update
      this.sendStatusUpdate();
    }
  }

  // Create and send an offer to the remote peer
  async createOffer() {
    try {
      if (!this.peerConnection) return;

      console.log("Creating offer...");
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      console.log("Setting local description...");
      await this.peerConnection.setLocalDescription(offer);
      
      console.log("Sending offer to signaling service...");
      this.signalingCallback({
        type: "offer",
        sdp: offer.sdp,
        sender: this.userId,
        metadata: {
          displayName: this.displayName,
          userId: this.userId,
          isCameraOn: this.localStream ? this.localStream.getVideoTracks().length > 0 : false,
          isMicOn: this.localStream ? this.localStream.getAudioTracks().length > 0 : false,
          isScreenSharing: false
        }
      });
    } catch (error) {
      console.error("Error creating offer:", error);
      toast({
        title: "Connection error",
        description: "Failed to create connection offer. Trying again in a moment.",
        variant: "destructive",
      });
      
      // Try again with a delay
      setTimeout(() => {
        this.createOffer();
      }, 2000);
    }
  }

  // Send a status update to remote peer
  sendStatusUpdate() {
    this.signalingCallback({
      type: "status-update",
      sender: this.userId,
      metadata: {
        displayName: this.displayName,
        userId: this.userId,
        isCameraOn: this.localStream ? this.localStream.getVideoTracks().length > 0 : false,
        isMicOn: this.localStream ? this.localStream.getAudioTracks().length > 0 : false,
        isScreenSharing: this.localStream ? this.localStream.getVideoTracks().some(track => track.label.includes('screen')) : false,
      }
    });
  }

  // Handle received offers from other peers
  async handleOffer(offer: RTCSessionDescriptionInit, sender: string, metadata?: any) {
    try {
      if (!this.peerConnection) return;
      
      console.log("Received offer from:", sender);
      
      // Save remote peer info
      this.remotePeerId = sender;
      this.remoteDisplayName = metadata?.displayName || "Remote User";
      this.lastActivity = Date.now();
      this.activeRemoteUsers.add(sender);
      
      if (this.onRemoteUserStatusChangeCallback && metadata) {
        this.onRemoteUserStatusChangeCallback({
          isCameraOn: metadata.isCameraOn || false,
          isMicOn: metadata.isMicOn || false,
          isScreenSharing: metadata.isScreenSharing || false,
          displayName: metadata.displayName || "Remote User",
          userId: metadata.userId || sender
        });
      }
      
      // If we already have a remote description, check if we need to rollback
      const currentState = this.peerConnection.signalingState;
      if (currentState !== "stable") {
        console.log(`Signaling state is ${currentState}, rolling back`);
        
        // We need to roll back to stable state
        try {
          await this.peerConnection.setLocalDescription({type: "rollback"});
        } catch (e) {
          console.log("Rollback not needed or failed:", e);
        }
      }
      
      console.log("Setting remote description from offer...");
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      
      console.log("Creating answer...");
      const answer = await this.peerConnection.createAnswer();
      
      console.log("Setting local description from answer...");
      await this.peerConnection.setLocalDescription(answer);
      
      console.log("Sending answer to:", sender);
      this.signalingCallback({
        type: "answer",
        sdp: answer.sdp,
        sender: this.userId,
        target: sender,
        metadata: {
          displayName: this.displayName,
          userId: this.userId,
          isCameraOn: this.localStream ? this.localStream.getVideoTracks().length > 0 : false,
          isMicOn: this.localStream ? this.localStream.getAudioTracks().length > 0 : false,
          isScreenSharing: false
        }
      });
      
      toast({
        title: "Incoming connection",
        description: `${this.remoteDisplayName} is connecting to your room`,
      });
      
      this.hasRemoteUser = true;
    } catch (error) {
      console.error("Error handling offer:", error);
      toast({
        title: "Connection error",
        description: "Failed to handle connection offer. Trying again in a moment.",
        variant: "destructive",
      });
      
      // Try again with a delay
      setTimeout(() => {
        this.handleOffer(offer, sender, metadata);
      }, 2000);
    }
  }

  // Handle received answers from other peers
  async handleAnswer(answer: RTCSessionDescriptionInit, sender: string, metadata?: any) {
    try {
      if (!this.peerConnection) return;
      
      console.log("Received answer, setting remote description...");
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      
      // Save remote peer info
      this.remotePeerId = sender;
      this.remoteDisplayName = metadata?.displayName || "Remote User";
      this.lastActivity = Date.now();
      this.activeRemoteUsers.add(sender);
      
      if (this.onRemoteUserStatusChangeCallback && metadata) {
        this.onRemoteUserStatusChangeCallback({
          isCameraOn: metadata.isCameraOn || false,
          isMicOn: metadata.isMicOn || false,
          isScreenSharing: metadata.isScreenSharing || false,
          displayName: metadata.displayName || "Remote User",
          userId: metadata.userId || sender
        });
      }
      
      console.log("Connection should be establishing now...");
      this.hasRemoteUser = true;
    } catch (error) {
      console.error("Error handling answer:", error);
      toast({
        title: "Connection error",
        description: "Failed to establish connection. Trying again in a moment.",
        variant: "destructive",
      });
      
      // Try again with a delay if the error seems retryable
      if (error instanceof DOMException && error.name !== "InvalidStateError") {
        setTimeout(() => {
          this.createOffer();
        }, 2000);
      }
    }
  }

  // Handle ICE candidates from other peers
  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (!this.peerConnection) return;
      
      console.log("Adding ICE candidate...");
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
      // Most ICE candidate errors don't need user notification
    }
  }

  // Handle presence messages from other peers
  handlePresence(senderId: string, metadata?: any) {
    // Update last activity time
    this.lastActivity = Date.now();
    
    // Add to active users
    if (senderId !== this.userId) {
      this.activeRemoteUsers.add(senderId);
      
      // If we receive a presence message from a user we're not connected to yet,
      // update UI to show them as available
      if (!this.remotePeerId && metadata && this.onRemoteUserStatusChangeCallback) {
        this.onRemoteUserStatusChangeCallback({
          isCameraOn: metadata.isCameraOn || false,
          isMicOn: metadata.isMicOn || false,
          isScreenSharing: metadata.isScreenSharing || false,
          displayName: metadata.displayName || "Remote User",
          userId: metadata.userId || senderId
        });
      }
    }
    
    // If we receive a presence message and we're not connected yet, send an offer
    if ((this.connectionState === "new" || this.connectionState === "connecting") && 
        senderId !== this.userId) {
      console.log("Received presence from peer, creating offer...");
      
      // Save remote peer info
      if (metadata) {
        this.remotePeerId = senderId;
        this.remoteDisplayName = metadata.displayName || "Remote User";
        
        if (this.onRemoteUserStatusChangeCallback) {
          this.onRemoteUserStatusChangeCallback({
            isCameraOn: metadata.isCameraOn || false,
            isMicOn: metadata.isMicOn || false,
            isScreenSharing: metadata.isScreenSharing || false,
            displayName: metadata.displayName || "Remote User",
            userId: metadata.userId || senderId
          });
        }
      }
      
      this.createOffer();
    }
  }

  // Handle status updates from other peers
  handleStatusUpdate(senderId: string, metadata?: any) {
    // Update last activity time
    this.lastActivity = Date.now();
    
    // Add to active users
    if (senderId !== this.userId) {
      this.activeRemoteUsers.add(senderId);
    }
    
    if (senderId === this.remotePeerId && metadata && this.onRemoteUserStatusChangeCallback) {
      this.onRemoteUserStatusChangeCallback({
        isCameraOn: metadata.isCameraOn || false,
        isMicOn: metadata.isMicOn || false,
        isScreenSharing: metadata.isScreenSharing || false,
        displayName: metadata.displayName || "Remote User",
        userId: metadata.userId || senderId
      });
    }
  }

  // Get the remote stream for display
  getRemoteStream() {
    return this.remoteStream;
  }
  
  // Check if we have a remote user
  hasRemoteUserConnected() {
    return this.hasRemoteUser || this.activeRemoteUsers.size > 0;
  }

  // Get connection state
  getConnectionState() {
    return this.connectionState;
  }

  // Get remote user display name
  getRemoteDisplayName() {
    return this.remoteDisplayName || "Remote User";
  }

  // Get remote user ID
  getRemoteUserId() {
    return this.remotePeerId;
  }
  
  // Get all active remote users
  getActiveRemoteUsers() {
    return Array.from(this.activeRemoteUsers);
  }
  
  // Update display name
  updateDisplayName(displayName: string) {
    this.displayName = displayName;
    this.sendStatusUpdate();
  }

  // Close the connection and clean up
  close() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.presenceCheckInterval !== null) {
      window.clearInterval(this.presenceCheckInterval);
      this.presenceCheckInterval = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    
    this.hasRemoteUser = false;
    this.connectionState = "new";
    this.remotePeerId = null;
    this.remoteDisplayName = null;
  }
}

// Enhanced signaling server implementation
export class SignalingService {
  private roomId: string;
  private userId: string;
  private callback: (data: SignalingData) => void;
  private storageKey: string;
  private checkInterval: number | null = null;
  private presenceInterval: number | null = null;
  private lastHeartbeat: number = Date.now();
  private displayName: string;
  private participantCache: Map<string, number> = new Map(); // Store last activity time for each participant
  private participantCleanupInterval: number | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private useBroadcastChannel: boolean = false;
  private useIndexedDB: boolean = false;
  private indexedDBName: string = "webrtc_signaling";
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(
    roomId: string,
    userId: string,
    displayName: string,
    callback: (data: SignalingData) => void
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.displayName = displayName;
    this.callback = callback;
    this.storageKey = `signaling_${this.roomId}`;
    
    // Try to use BroadcastChannel (works in same-origin tabs)
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(`webrtc_room_${this.roomId}`);
        this.useBroadcastChannel = true;
        console.log("Using BroadcastChannel for signaling");
        
        this.broadcastChannel.onmessage = (event) => {
          const msg = event.data;
          if (msg.sender !== this.userId) {
            console.log(`Received signal via BroadcastChannel: ${msg.type} from ${msg.sender}`);
            this.callback(msg);
            
            // Update participant cache for presence messages
            if ((msg.type === "presence" || msg.type === "status-update") && msg.sender) {
              this.participantCache.set(msg.sender, Date.now());
            }
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported, falling back to localStorage");
      this.useBroadcastChannel = false;
    }
    
    // See if IndexedDB is available as another option
    try {
      if (typeof indexedDB !== 'undefined') {
        this.useIndexedDB = true;
        console.log("IndexedDB is available for signaling");
        
        // We'll initialize it only when needed
      }
    } catch (e) {
      console.warn("IndexedDB not supported");
      this.useIndexedDB = false;
    }
    
    this.startListening();
    this.startPresenceHeartbeat();
    this.startParticipantCleanup();
  }

  // Send signaling data
  send(data: SignalingData) {
    try {
      // Add timestamp to data for ordering and cleanup
      const messageWithTimestamp = {
        ...data,
        timestamp: Date.now(),
        displayName: this.displayName,
      };
      
      // Try to use BroadcastChannel first (works across tabs)
      if (this.useBroadcastChannel && this.broadcastChannel) {
        this.broadcastChannel.postMessage(messageWithTimestamp);
      }
      
      // Always use localStorage as fallback (works across browser refreshes)
      const storageData = localStorage.getItem(this.storageKey);
      const messages = storageData ? JSON.parse(storageData) : [];
      messages.push(messageWithTimestamp);
      
      // Only keep the last 200 messages to avoid storage issues
      const recentMessages = messages.slice(-200);
      localStorage.setItem(this.storageKey, JSON.stringify(recentMessages));
      
      console.log(`Sent signal: ${data.type} from ${this.userId} ${data.target ? 'to ' + data.target : ''}`);
      
      // Update participant cache for presence messages
      if (data.type === "presence" && data.sender) {
        this.participantCache.set(data.sender, Date.now());
      }
      
      // Use SessionStorage as an additional mechanism
      try {
        const sessionKey = `${this.storageKey}_latest`;
        sessionStorage.setItem(sessionKey, JSON.stringify(messageWithTimestamp));
      } catch (e) {
        console.warn("Failed to use sessionStorage", e);
      }
      
    } catch (error) {
      console.error("Error sending signaling data:", error);
      
      // If we've hit storage limits, try to clean up
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        console.warn("Storage quota exceeded, cleaning up old messages");
        this.cleanupStorage();
      }
    }
  }
  
  // Clean up storage if we've hit limits
  private cleanupStorage() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log("Cleared signaling storage due to quota limits");
      
      // Send a notification about the cleanup
      this.send({
        type: "storage-cleanup",
        sender: this.userId,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error("Failed to clean up storage:", e);
    }
  }

  // Start the presence heartbeat
  private startPresenceHeartbeat() {
    // Send initial presence notification
    this.send({
      type: "presence",
      sender: this.userId,
      timestamp: Date.now(),
      metadata: {
        displayName: this.displayName,
        userId: this.userId,
      }
    });
    
    // Send a presence notification every 1.5 seconds (more frequent for better reliability)
    this.presenceInterval = window.setInterval(() => {
      this.send({
        type: "presence",
        sender: this.userId,
        timestamp: Date.now(),
        metadata: {
          displayName: this.displayName,
          userId: this.userId,
        }
      });
    }, 1500);
  }
  
  // Start cleanup of inactive participants
  private startParticipantCleanup() {
    this.participantCleanupInterval = window.setInterval(() => {
      const now = Date.now();
      
      // Check for inactive participants (no presence updates in the last 8 seconds)
      for (const [participantId, lastSeen] of this.participantCache.entries()) {
        if (now - lastSeen > 8000 && participantId !== this.userId) {
          console.log(`Participant ${participantId} appears to be inactive`);
          
          // Send a participant-left message
          this.send({
            type: "participant-left",
            sender: participantId,
            timestamp: now
          });
          
          // Remove from cache
          this.participantCache.delete(participantId);
        }
      }
    }, 4000);
  }

  // Start listening for signaling messages
  private startListening() {
    // Keep track of the last processed timestamp
    this.lastHeartbeat = Date.now();

    // Check for new messages more frequently (200ms instead of 300ms)
    this.checkInterval = window.setInterval(() => {
      try {
        const storageData = localStorage.getItem(this.storageKey);
        if (!storageData) return;

        const messages = JSON.parse(storageData);
        
        // Process only new messages not sent by us
        const newMessages = messages.filter(
          (msg: any) => 
            msg.timestamp > this.lastHeartbeat && 
            msg.sender !== this.userId &&
            (!msg.target || msg.target === this.userId || msg.target === 'broadcast')
        );
        
        if (newMessages.length > 0) {
          // Update the last processed timestamp
          const timestamps = newMessages.map((msg: any) => msg.timestamp);
          this.lastHeartbeat = Math.max(...timestamps);
          
          // Forward new messages to the callback
          newMessages.forEach((msg: SignalingData) => {
            console.log(`Received signal via localStorage: ${msg.type} from ${msg.sender}`);
            
            // Update participant cache for presence messages
            if ((msg.type === "presence" || msg.type === "status-update") && msg.sender) {
              this.participantCache.set(msg.sender, Date.now());
            }
            
            this.callback(msg);
          });
        }
        
        // Also check sessionStorage for any missed messages
        try {
          const sessionKey = `${this.storageKey}_latest`;
          const latestMsg = sessionStorage.getItem(sessionKey);
