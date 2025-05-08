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
}

// Class to manage WebRTC connections
export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private signalingCallback: (data: SignalingData) => void;
  private userId: string;
  private roomId: string;

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
        this.signalingCallback({
          type: "ice-candidate",
          candidate: event.candidate,
          sender: this.userId,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection?.connectionState);
    };

    // Add tracks from remote peer to the remote stream
    this.peerConnection.ontrack = (event) => {
      console.log("Track received:", event.track.kind);
      this.remoteStream.addTrack(event.track);
    };
  }

  // Set local media stream (camera/mic)
  async setLocalStream(stream: MediaStream) {
    this.localStream = stream;
    
    // Add all tracks from local stream to peer connection
    if (this.peerConnection) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }
  }

  // Create and send an offer to the remote peer
  async createOffer() {
    try {
      if (!this.peerConnection) return;

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
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
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.signalingCallback({
        type: "answer",
        sdp: answer.sdp,
        sender: this.userId,
        target: sender,
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
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
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
      
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }

  // Get the remote stream for display
  getRemoteStream() {
    return this.remoteStream;
  }

  // Close the connection and clean up
  close() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
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
  }

  // Send signaling data
  send(data: SignalingData) {
    try {
      const storageData = localStorage.getItem(this.storageKey);
      const messages = storageData ? JSON.parse(storageData) : [];
      messages.push({
        ...data,
        timestamp: Date.now(),
      });
      
      // Only keep the last 30 messages to avoid storage issues
      const recentMessages = messages.slice(-30);
      localStorage.setItem(this.storageKey, JSON.stringify(recentMessages));
    } catch (error) {
      console.error("Error sending signaling data:", error);
    }
  }

  // Start listening for signaling messages
  private startListening() {
    // Keep track of the last processed timestamp
    let lastProcessed = Date.now();

    // Check for new messages every second
    this.checkInterval = window.setInterval(() => {
      try {
        const storageData = localStorage.getItem(this.storageKey);
        if (!storageData) return;

        const messages = JSON.parse(storageData);
        
        // Process only new messages not meant for us
        const newMessages = messages.filter(
          (msg: any) => 
            msg.timestamp > lastProcessed && 
            msg.sender !== this.userId &&
            (!msg.target || msg.target === this.userId)
        );
        
        if (newMessages.length > 0) {
          lastProcessed = Math.max(...newMessages.map((msg: any) => msg.timestamp));
          
          // Forward new messages to the callback
          newMessages.forEach((msg: SignalingData) => {
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
  }
}
