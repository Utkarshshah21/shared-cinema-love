
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Heart, VideoIcon, ScreenShareIcon, MessageCircle, MicIcon, MicOffIcon, VideoOffIcon, ScreenShareOffIcon } from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import HeartButton from '@/components/HeartButton';

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
  
  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId || '');
    toast({
      title: "Room code copied!",
      description: "Share this code with your partner to connect",
    });
  };
  
  // Toggle camera on/off
  const toggleCamera = () => {
    setIsCameraOn(!isCameraOn);
    // This is where we would implement WebRTC camera toggle
  };
  
  // Toggle screen sharing on/off
  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
    // This is where we would implement WebRTC screen sharing
  };
  
  // Toggle microphone on/off
  const toggleMic = () => {
    setIsMicOn(!isMicOn);
    // This is where we would implement WebRTC mic toggle
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
    
    return () => clearTimeout(timer);
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
          
          <HeartButton />
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
                  className={isScreenSharing ? "bg-pink-500 hover:bg-pink-600" : ""}
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
                      <p className="text-sm text-muted-foreground mt-2">Waiting for your partner to join</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-xl font-medium text-purple-700">
                        {isCameraOn ? "Your camera is on" : "Your camera is off"}
                      </p>
                    </div>
                    
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="absolute bottom-4 right-4 w-48 rounded-lg border-2 border-purple-300 shadow-lg"
                    ></video>
                  </>
                )}
              </Card>
            </TabsContent>
            
            <TabsContent value="screen" className="mt-0">
              <Card className="aspect-video relative overflow-hidden border-primary/20 bg-white/90 backdrop-blur-sm">
                <div className="absolute inset-0 flex items-center justify-center">
                  {isScreenSharing ? (
                    <p className="text-xl font-medium text-purple-700">You are sharing your screen</p>
                  ) : (
                    <div className="text-center">
                      <ScreenShareIcon size={48} className="text-muted-foreground mx-auto mb-4" />
                      <p className="text-xl font-medium text-purple-700">Screen sharing is off</p>
                      <Button 
                        onClick={toggleScreenShare}
                        className="mt-4 bg-pink-500 hover:bg-pink-600"
                      >
                        Start Sharing
                      </Button>
                    </div>
                  )}
                </div>
                
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute bottom-4 right-4 w-48 rounded-lg border-2 border-purple-300 shadow-lg"
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
