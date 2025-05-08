// A simple implementation of WebRTC peer connection
import { toast } from "@/components/ui/use-toast";

// Configuration for WebRTC connections
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
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

  constructor(
    userId: string,
    roomId: string,
    signalingCallback: (data: SignalingData) => void
  ) {
    this.userId = userId;
    this.roomId = roomId;
    this.signalingCallback = signalingCallback;
    this.initialize();
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
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const newState = this.peerConnection.connectionState;
      console.log("Connection state changed:", newState);
      this.connectionState = newState;
      
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
      
      // Announce remote user connected via toast
      toast({
        title: "Remote user connected",
        description: "Someone joined your room",
      });
    };
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

  // Handle received offers from other peers
  async handleOffer(offer: RTCSessionDescriptionInit, sender: string) {
    try {
      if (!this.peerConnection) return;
      
      console.log("Received offer from:", sender);
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
      });
      
      toast({
        title: "Incoming connection",
        description: "Someone is trying to connect to your room",
      });
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
  async handleAnswer(answer: RTCSessionDescriptionInit) {
    try {
      if (!this.peerConnection) return;
      
      console.log("Received answer, setting remote description...");
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      
      console.log("Connection should be establishing now...");
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
  handlePresence(senderId: string) {
    // If we receive a presence message and we're not connected yet, send an offer
    if (this.connectionState === "new" || this.connectionState === "connecting") {
      console.log("Received presence from peer, creating offer...");
      this.createOffer();
    }
  }

  // Get the remote stream for display
  getRemoteStream() {
    return this.remoteStream;
  }
  
  // Check if we have a remote user
  hasRemoteUserConnected() {
    return this.hasRemoteUser;
  }

  // Get connection state
  getConnectionState() {
    return this.connectionState;
  }

  // Close the connection and clean up
  close() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

  constructor(
    roomId: string,
    userId: string,
    callback: (data: SignalingData) => void
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.callback = callback;
    this.storageKey = `signaling_${this.roomId}`;
    this.startListening();
    this.startPresenceHeartbeat();
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
      };
      
      messages.push(messageWithTimestamp);
      
      // Only keep the last 50 messages to avoid storage issues
      const recentMessages = messages.slice(-50);
      localStorage.setItem(this.storageKey, JSON.stringify(recentMessages));
      
      console.log(`Sent signal: ${data.type} from ${this.userId} ${data.target ? 'to ' + data.target : ''}`);
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
      timestamp: Date.now()
    });
    
    // Send a presence notification every 5 seconds
    this.presenceInterval = window.setInterval(() => {
      this.send({
        type: "presence",
        sender: this.userId,
        timestamp: Date.now()
      });
    }, 5000);
  }

  // Start listening for signaling messages
  private startListening() {
    // Keep track of the last processed timestamp
    this.lastHeartbeat = Date.now();

    // Check for new messages every second
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
            this.callback(msg);
          });
        }
      } catch (error) {
        console.error("Error processing signaling data:", error);
      }
    }, 1000);
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
  }

  // Generate shareable room URL
  getShareableLink() {
    return window.location.origin + '/room/' + this.roomId;
  }
}
