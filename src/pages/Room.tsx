import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, VideoIcon, ScreenShareIcon, MessageCircle, MicIcon, MicOffIcon, VideoOffIcon, ScreenShareOffIcon } from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import ShareButton from '@/components/ShareButton';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<{text: string, isSelf: boolean}[]>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  
  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId || '');
    toast({
      title: "Room code copied!",
      description: "Share this code with a friend to connect",
    });
  };
  
  // Toggle camera on/off
  const toggleCamera = async () => {
    if (isCameraOn) {
      // Turn off camera
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      setIsCameraOn(false);
    } else {
      try {
        // Turn on camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: isMicOn });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        localStream.current = stream;
        setIsCameraOn(true);
        
        toast({
          title: "Camera turned on",
          description: "Your camera is now active",
        });
      } catch (error) {
        console.error("Error accessing camera:", error);
        toast({
          title: "Camera access failed",
          description: "Could not access your camera. Please check permissions.",
          variant: "destructive"
        });
      }
    }
  };
  
  // Toggle screen sharing on/off
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Turn off screen sharing
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      setIsScreenSharing(false);
    } else {
      try {
        // Turn off camera if it's on
        if (isCameraOn) {
          if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
          }
          setIsCameraOn(false);
        }
        
        // Start screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        localStream.current = stream;
        setIsScreenSharing(true);
        
        // Listen for when the user stops sharing via the browser UI
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          localStream.current = null;
        };
        
        toast({
          title: "Screen sharing started",
          description: "You are now sharing your screen",
        });
      } catch (error) {
        console.error("Error sharing screen:", error);
        toast({
          title: "Screen sharing failed",
          description: "Could not share your screen. Please try again.",
          variant: "destructive"
        });
      }
    }
  };
  
  // Toggle microphone on/off
  const toggleMic = async () => {
    if (isMicOn) {
      // Turn off microphone
      if (localStream.current) {
        localStream.current.getAudioTracks().forEach(track => track.stop());
        
        // Keep video tracks if camera is on
        if (isCameraOn && localStream.current.getVideoTracks().length > 0) {
          try {
            const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: true });
            localStream.current = videoOnlyStream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = videoOnlyStream;
            }
          } catch (error) {
            console.error("Error recreating video stream:", error);
          }
        } else {
          localStream.current = null;
        }
      }
      
      setIsMicOn(false);
    } else {
      try {
        // Turn on microphone
        let stream;
        
        if (localStream.current && isCameraOn) {
          // If camera is already on, add audio to existing stream
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioTrack = audioStream.getAudioTracks()[0];
          
          // Add the audio track to the existing stream
          localStream.current.addTrack(audioTrack);
          stream = localStream.current;
        } else {
          // Start new audio-only stream
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStream.current = stream;
        }
        
        setIsMicOn(true);
        
        toast({
          title: "Microphone turned on",
          description: "Your microphone is now active",
        });
      } catch (error) {
        console.error("Error accessing microphone:", error);
        toast({
          title: "Microphone access failed",
          description: "Could not access your microphone. Please check permissions.",
          variant: "destructive"
        });
      }
    }
  };
  
  // Send chat message
  const sendMessage = () => {
    if (message.trim()) {
      setChatMessages([...chatMessages, {text: message, isSelf: true}]);
      setMessage('');
      
      // Simulate response (in a real app, this would come from the other user via WebRTC)
      setTimeout(() => {
        setChatMessages(prev => [...prev, {
          text: "I received your message! This is a placeholder response.",
          isSelf: false
        }]);
      }, 1000);
    }
  };

  // For demo purposes - this would be replaced by actual WebRTC setup
  useEffect(() => {
    // Simulate connection after 2 seconds
    const timer = setTimeout(() => {
      setIsConnected(true);
      toast({
        title: "Connected!",
        description: "You've successfully connected to room " + roomId,
      });
    }, 2000);
    
    return () => {
      clearTimeout(timer);
      // Clean up any active media streams
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [roomId, toast]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="flex items-center text-purple-700"
        >
          <ArrowLeft size={20} className="mr-2" /> Back to Home
        </Button>
        
        <div className="flex items-center">
          <div className="bg-purple-100 rounded-lg px-4 py-2 flex items-center mr-4">
            <span className="mr-2 text-purple-800 font-medium">Room:</span> 
            <span className="font-bold text-purple-900">{roomId}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={copyRoomCode} 
              className="ml-2 text-purple-700 hover:text-purple-900"
            >
              Copy
            </Button>
          </div>
          
          <ShareButton />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="video" className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <TabsList className="bg-purple-100">
                <TabsTrigger value="video" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                  <VideoIcon size={16} className="mr-2" /> Video Chat
                </TabsTrigger>
                <TabsTrigger value="screen" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                  <ScreenShareIcon size={16} className="mr-2" /> Screen Share
                </TabsTrigger>
              </TabsList>
              
              <div className="flex space-x-2">
                <Button 
                  variant={isMicOn ? "default" : "outline"} 
                  size="icon"
                  onClick={toggleMic}
                  className={isMicOn ? "bg-purple-500 hover:bg-purple-600" : ""}
                >
                  {isMicOn ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
                </Button>
                
                <Button 
                  variant={isCameraOn ? "default" : "outline"} 
                  size="icon"
                  onClick={toggleCamera}
                  className={isCameraOn ? "bg-purple-500 hover:bg-purple-600" : ""}
                >
                  {isCameraOn ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
                </Button>
                
                <Button 
                  variant={isScreenSharing ? "default" : "outline"} 
                  size="icon"
                  onClick={toggleScreenShare}
                  className={isScreenSharing ? "bg-purple-500 hover:bg-purple-600" : ""}
                >
                  {isScreenSharing ? <ScreenShareIcon size={18} /> : <ScreenShareOffIcon size={18} />}
                </Button>
              </div>
            </div>
            
            <TabsContent value="video" className="mt-0">
              <Card className="aspect-video relative overflow-hidden border-primary/20 bg-white/90 backdrop-blur-sm">
                {!isConnected ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-purple-700">Connecting to room {roomId}...</p>
                      <p className="text-sm text-muted-foreground mt-2">Waiting for your friend to join</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      {!isCameraOn && (
                        <p className="text-xl font-medium text-purple-700">
                          {isCameraOn ? "Your camera is on" : "Your camera is off"}
                        </p>
                      )}
                    </div>
                    
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className={`${isCameraOn ? "object-cover w-full h-full" : "hidden"}`}
                    ></video>
                    
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="absolute bottom-4 right-4 w-48 rounded-lg border-2 border-purple-300 shadow-lg hidden"
                    ></video>
                  </>
                )}
              </Card>
            </TabsContent>
            
            <TabsContent value="screen" className="mt-0">
              <Card className="aspect-video relative overflow-hidden border-primary/20 bg-white/90 backdrop-blur-sm">
                <div className="absolute inset-0 flex items-center justify-center">
                  {!isScreenSharing && (
                    <div className="text-center">
                      <ScreenShareIcon size={48} className="text-muted-foreground mx-auto mb-4" />
                      <p className="text-xl font-medium text-purple-700">Screen sharing is off</p>
                      <Button 
                        onClick={toggleScreenShare}
                        className="mt-4 bg-purple-500 hover:bg-purple-600"
                      >
                        Start Sharing
                      </Button>
                    </div>
                  )}
                </div>
                
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`${isScreenSharing ? "object-contain w-full h-full" : "hidden"}`}
                ></video>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        <div className="lg:col-span-1">
          <Card className="h-full border-primary/20 bg-white/90 backdrop-blur-sm">
            <div className="p-4 flex items-center justify-between border-b">
              <div className="flex items-center">
                <MessageCircle size={20} className="text-purple-500 mr-2" />
                <h3 className="font-medium text-lg">Chat</h3>
              </div>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
            </div>
            
            <ChatBox messages={chatMessages} />
            
            <div className="p-4 border-t flex">
              <Input 
                value={message} 
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..." 
                className="mr-2"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button 
                onClick={sendMessage} 
                className="bg-purple-500 hover:bg-purple-600"
              >
                Send
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Room;
