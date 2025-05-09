
// A simple implementation of WebRTC peer connection
import { toast } from "@/components/ui/use-toast";

// Configuration for WebRTC connections
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
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
    this.peerConnection = new RTCPeerConnection(configuration);

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
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      console.log("ICE connection state:", this.peerConnection.iceConnectionState);
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
  }

  // Start a regular check for active participants
  private startPresenceCheck() {
    this.presenceCheckInterval = window.setInterval(() => {
      // Send presence info periodically
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
      if (now - this.lastActivity > 15000 && this.hasRemoteUser) {
        console.log("Remote user appears inactive, checking connection");
        if (this.peerConnection && (this.peerConnection.connectionState === "disconnected" || 
            this.peerConnection.connectionState === "failed")) {
          this.attemptReconnect();
        }
      }
    }, 3000);
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
      this.close();
      this.initialize();
      
      if (this.localStream) {
        this.setLocalStream(this.localStream);
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
    }, 2000);
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
        description: "Failed to create connection offer",
        variant: "destructive",
      });
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
        description: "Failed to handle connection offer",
        variant: "destructive",
      });
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
        description: "Failed to establish connection",
        variant: "destructive",
      });
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
    }
  }

  // Handle presence messages from other peers
  handlePresence(senderId: string, metadata?: any) {
    // Update last activity time
    this.lastActivity = Date.now();
    
    // Add to active users
    if (senderId !== this.userId) {
      this.activeRemoteUsers.add(senderId);
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

// Simple signaling server simulation using local storage for the demo
// In a real app, this would be a WebSocket server or similar
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
    this.startListening();
    this.startPresenceHeartbeat();
    this.startParticipantCleanup();
  }

  // Send signaling data
  send(data: SignalingData) {
    try {
      const storageData = localStorage.getItem(this.storageKey);
      const messages = storageData ? JSON.parse(storageData) : [];
      
      // Add timestamp to data for ordering and cleanup
      const messageWithTimestamp = {
        ...data,
        timestamp: Date.now(),
        displayName: this.displayName,
      };
      
      messages.push(messageWithTimestamp);
      
      // Only keep the last 100 messages to avoid storage issues
      const recentMessages = messages.slice(-100);
      localStorage.setItem(this.storageKey, JSON.stringify(recentMessages));
      
      console.log(`Sent signal: ${data.type} from ${this.userId} ${data.target ? 'to ' + data.target : ''}`);
      
      // Update participant cache for presence messages
      if (data.type === "presence" && data.sender) {
        this.participantCache.set(data.sender, Date.now());
      }
    } catch (error) {
      console.error("Error sending signaling data:", error);
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
    
    // Send a presence notification every 3 seconds
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
    }, 3000);
  }
  
  // Start cleanup of inactive participants
  private startParticipantCleanup() {
    this.participantCleanupInterval = window.setInterval(() => {
      const now = Date.now();
      
      // Check for inactive participants (no presence updates in the last 10 seconds)
      for (const [participantId, lastSeen] of this.participantCache.entries()) {
        if (now - lastSeen > 10000 && participantId !== this.userId) {
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
    }, 5000);
  }

  // Start listening for signaling messages
  private startListening() {
    // Keep track of the last processed timestamp
    this.lastHeartbeat = Date.now();

    // Check for new messages every 500ms
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
            (!msg.target || msg.target === this.userId)
        );
        
        if (newMessages.length > 0) {
          // Update the last processed timestamp
          const timestamps = newMessages.map((msg: any) => msg.timestamp);
          this.lastHeartbeat = Math.max(...timestamps);
          
          // Forward new messages to the callback
          newMessages.forEach((msg: SignalingData) => {
            console.log(`Received signal: ${msg.type} from ${msg.sender}`);
            
            // Update participant cache for presence messages
            if ((msg.type === "presence" || msg.type === "status-update") && msg.sender) {
              this.participantCache.set(msg.sender, Date.now());
            }
            
            this.callback(msg);
          });
        }
      } catch (error) {
        console.error("Error processing signaling data:", error);
      }
    }, 500);
  }

  // Update display name
  updateDisplayName(displayName: string) {
    this.displayName = displayName;
  }

  // Stop listening for messages
  stop() {
    if (this.checkInterval !== null) {
      window.clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.presenceInterval !== null) {
      window.clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    
    if (this.participantCleanupInterval !== null) {
      window.clearInterval(this.participantCleanupInterval);
      this.participantCleanupInterval = null;
    }
    
    // Send a final participant-left message
    this.send({
      type: "participant-left",
      sender: this.userId,
      timestamp: Date.now()
    });
  }

  // Generate shareable room URL
  getShareableLink() {
    return window.location.origin + '/room/' + this.roomId;
  }
}
