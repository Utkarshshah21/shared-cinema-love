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
  private onRemoteStreamUpdateCallback: ((stream: MediaStream) => void) | null = null;
  private lastActivity: number = Date.now();
  private presenceCheckInterval: number | null = null;
  private activeRemoteUsers: Map<string, number> = new Map(); // Map of userId to last activity timestamp
  private iceRetryCount: number = 0;
  private maxIceRetries: number = 5; // Increased from 3
  private useBackupSignaling: boolean = false;
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map(); // Store candidates by sender until SDP exchange is done

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
        
        // If there are any pending ICE candidates, try applying them now
        if (this.pendingIceCandidates.has(this.remotePeerId || '')) {
          const candidates = this.pendingIceCandidates.get(this.remotePeerId || '') || [];
          console.log(`Applying ${candidates.length} pending ICE candidates`);
          candidates.forEach(candidate => {
            this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidate))
              .catch(e => console.warn("Failed to add pending ICE candidate:", e));
          });
          this.pendingIceCandidates.delete(this.remotePeerId || '');
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
      // Remove any existing tracks of the same kind to avoid duplicates
      const existingTracks = this.remoteStream.getTracks().filter(t => t.kind === event.track.kind);
      existingTracks.forEach(track => {
        this.remoteStream.removeTrack(track);
      });
      
      // Add the new track
      this.remoteStream.addTrack(event.track);
      
      // Notify subscribers
      if (this.onRemoteStreamUpdateCallback) {
        this.onRemoteStreamUpdateCallback(this.remoteStream);
      }
      
      this.hasRemoteUser = true;
      this.lastActivity = Date.now();
      
      // Add to active users
      if (this.remotePeerId) {
        this.activeRemoteUsers.set(this.remotePeerId, Date.now());
      }
      
      // Update remote user status
      if (this.onRemoteUserStatusChangeCallback) {
        this.onRemoteUserStatusChangeCallback({
          isCameraOn: this.remoteStream.getVideoTracks().length > 0,
          isMicOn: this.remoteStream.getAudioTracks().length > 0,
          isScreenSharing: this.remoteStream.getVideoTracks().some(track => track.label.includes('screen')),
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

  // Register callback for remote stream updates
  public onRemoteStreamUpdate(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamUpdateCallback = callback;
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
      
      // Clean up stale users
      for (const [userId, lastSeen] of this.activeRemoteUsers.entries()) {
        if (now - lastSeen > 15000) { // 15 seconds without updates
          console.log(`User ${userId} appears inactive, removing from active users`);
          this.activeRemoteUsers.delete(userId);
          
          // If this was our remote peer, try to reconnect
          if (userId === this.remotePeerId && this.hasRemoteUser) {
            this.hasRemoteUser = false;
            this.attemptReconnect();
          }
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

  // Handle participant leaving
  public handleParticipantLeft(participantId: string) {
    if (participantId === this.remotePeerId) {
      console.log(`Remote peer ${participantId} has left`);
      this.remotePeerId = null;
      this.remoteDisplayName = null;
      this.hasRemoteUser = false;
      
      // Clear all remote tracks
      const tracks = this.remoteStream.getTracks();
      tracks.forEach(track => {
        this.remoteStream.removeTrack(track);
        track.stop();
      });
      
      // Notify stream update
      if (this.onRemoteStreamUpdateCallback) {
        this.onRemoteStreamUpdateCallback(this.remoteStream);
      }
    }
    
    // Remove from active users
    this.activeRemoteUsers.delete(participantId);
  }

  // Handle renegotiation request (e.g., for screen sharing changes)
  public handleRenegotiationRequest(senderId: string) {
    if (senderId === this.remotePeerId) {
      console.log("Renegotiation requested, creating new offer");
      this.createOffer();
    }
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
          this.createOffer();
        } catch (e) {
          console.error("Failed to restart ICE, recreating connection", e);
          this.close();
          this.initialize();
          
          if (this.localStream) {
            this.setLocalStream(this.localStream);
          }
          
          // Create a new offer after a short delay
          setTimeout(() => this.createOffer(), 500);
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
          isScreenSharing: this.localStream ? this.localStream.getVideoTracks().some(track => track.label.includes('screen')) : false
        }
      });
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
      
      // Trigger renegotiation if we're already connected
      if (this.hasRemoteUser) {
        this.signalingCallback({
          type: "renegotiate",
          sender: this.userId,
          metadata: {
            displayName: this.displayName,
            userId: this.userId,
          }
        });
      }
    }
  }

  // Create and send an offer to the remote peer
  async createOffer() {
    try {
      if (!this.peerConnection) return;

      console.log("Creating offer...");
      
      // Add bandwidth constraints to improve quality
      const offerOptions: RTCOfferOptions = { 
        offerToReceiveAudio: true, 
        offerToReceiveVideo: true,
      };
      
      const offer = await this.peerConnection.createOffer(offerOptions);
      
      // Set SDP bitrate constraints for better performance
      let sdp = offer.sdp;
      if (sdp) {
        // Set video bitrate to high quality (2500kbps)
        sdp = this.setMediaBitrate(sdp, 'video', 2500);
        // Set audio bitrate (64kbps)
        sdp = this.setMediaBitrate(sdp, 'audio', 64);
        
        // Create modified offer
        offer.sdp = sdp;
      }
      
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
          isScreenSharing: this.localStream ? this.localStream.getVideoTracks().some(track => track.label.includes('screen')) : false
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
  
  // Helper function to set SDP bitrate
  private setMediaBitrate(sdp: string, media: 'audio' | 'video', bitrate: number): string {
    const lines = sdp.split('\n');
    let line = -1;
    
    // Find the media section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=' + media)) {
        line = i;
        break;
      }
    }
    
    if (line === -1) {
      return sdp; // Media type not found
    }
    
    // Find the next m-line if any
    let nextMLine = -1;
    for (let i = line + 1; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        nextMLine = i;
        break;
      }
    }
    
    // If we have an m-line but not the next one, process until the end
    if (nextMLine === -1) {
      nextMLine = lines.length;
    }
    
    // Check if there's already a b-line
    let hasBLine = false;
    for (let i = line + 1; i < nextMLine; i++) {
      if (lines[i].startsWith('b=AS:')) {
        lines[i] = 'b=AS:' + bitrate;
        hasBLine = true;
        break;
      }
    }
    
    // If there's no b-line, add it after the media line
    if (!hasBLine) {
      lines.splice(line + 1, 0, 'b=AS:' + bitrate);
    }
    
    return lines.join('\n');
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
      this.activeRemoteUsers.set(sender, Date.now());
      
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
      
      // Set SDP bitrate constraints for better performance
      let sdp = answer.sdp;
      if (sdp) {
        // Set video bitrate to high quality (2500kbps)
        sdp = this.setMediaBitrate(sdp, 'video', 2500);
        // Set audio bitrate (64kbps)
        sdp = this.setMediaBitrate(sdp, 'audio', 64);
        
        // Create modified answer
        answer.sdp = sdp;
      }
      
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
          isScreenSharing: this.localStream ? this.localStream.getVideoTracks().some(track => track.label.includes('screen')) : false
        }
      });
      
      toast({
        title: "Incoming connection",
        description: `${this.remoteDisplayName} is connecting to your room`,
      });
      
      this.hasRemoteUser = true;
      
      // Apply any pending ICE candidates now that we've set remote description
      const pendingCandidates = this.pendingIceCandidates.get(sender);
      if (pendingCandidates && pendingCandidates.length > 0) {
        console.log(`Applying ${pendingCandidates.length} pending ICE candidates from ${sender}`);
        for (const candidate of pendingCandidates) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Failed to add pending ICE candidate:", e));
        }
        this.pendingIceCandidates.delete(sender);
      }
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
      this.activeRemoteUsers.set(sender, Date.now());
      
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
      
      // Apply any pending ICE candidates now that we've set remote description
      const pendingCandidates = this.pendingIceCandidates.get(sender);
      if (pendingCandidates && pendingCandidates.length > 0) {
        console.log(`Applying ${pendingCandidates.length} pending ICE candidates from ${sender}`);
        for (const candidate of pendingCandidates) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.warn("Failed to add pending ICE candidate:", e));
        }
        this.pendingIceCandidates.delete(sender);
      }
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
  async handleIceCandidate(candidate: RTCIceCandidateInit, sender: string) {
    try {
      if (!this.peerConnection) return;
      
      // Update activity timestamp for this user
      this.activeRemoteUsers.set(sender, Date.now());
      
      // Store the candidate if we don't yet have a remote description
      if (this.peerConnection.remoteDescription === null) {
        console.log("Received ICE candidate before remote description, storing for later");
        if (!this.pendingIceCandidates.has(sender)) {
          this.pendingIceCandidates.set(sender, []);
        }
        this.pendingIceCandidates.get(sender)?.push(candidate);
        return;
      }
      
      console.log("Adding ICE candidate...");
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      ).catch(e => {
        console.warn("Failed to add ICE candidate immediately, will retry:", e);
        // Store for retry later
        if (!this.pendingIceCandidates.has(sender)) {
          this.pendingIceCandidates.set(sender, []);
        }
        this.pendingIceCandidates.get(sender)?.push(candidate);
      });
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
      // Most ICE candidate errors don't need user notification, but we'll store it for retry
      if (!this.pendingIceCandidates.has(sender)) {
        this.pendingIceCandidates.set(sender, []);
      }
      this.pendingIceCandidates.get(sender)?.push(candidate);
    }
  }

  // Handle presence messages from other peers
  handlePresence(senderId: string, metadata?: any) {
    // Update last activity time and store in active users
    this.lastActivity = Date.now();
    
    // Add to active users
    if (senderId !== this.userId) {
      this.activeRemoteUsers.set(senderId, Date.now());
      
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
    // Only the peer with the "lower" ID will initiate to avoid simultaneous offers
    if ((this.connectionState === "new" || this.connectionState === "connecting") && 
        senderId !== this.userId && 
        this.shouldInitiateConnection(senderId)) {
      console.log(`Received presence from peer (${senderId}), creating offer as initiator`);
      
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
  
  // Determine which peer should initiate the connection
  // Use consistent logic to avoid both peers trying to initiate simultaneously
  private shouldInitiateConnection(peerId: string): boolean {
    return this.userId < peerId; // Lexicographically lower ID initiates
  }

  // Handle status updates from other peers
  handleStatusUpdate(senderId: string, metadata?: any) {
    // Update last activity time
    this.lastActivity = Date.now();
    
    // Add to active users
    if (senderId !== this.userId) {
      this.activeRemoteUsers.set(senderId, Date.now());
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
    return Array.from(this.activeRemoteUsers.keys());
  }
  
  // Update display name
  updateDisplayName
