
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, VideoIcon, ScreenShareIcon, MessageCircle, MicIcon, MicOffIcon, 
  VideoOffIcon, ScreenShareOffIcon, Copy, QrCode, UserCheck, Users, User
} from 'lucide-react';
import ChatBox from '@/components/ChatBox';
import ShareButton from '@/components/ShareButton';
import { useWebRTC } from '@/hooks/useWebRTC';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Table,
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<{text: string, isSelf: boolean}[]>([]);
  const [showQrCode, setShowQrCode] = useState(false);
  const [userName, setUserName] = useState(`User ${Math.floor(Math.random() * 1000)}`);
  const [showUserList, setShowUserList] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Use our WebRTC hook
  const {
    localStream,
    remoteStream,
    isCameraOn,
    isMicOn,
    isScreenSharing,
    isConnected,
    hasRemoteUser,
    remoteParticipant,
    remoteParticipants,
    connectionState,
    userDisplayName,
    toggleCamera,
    toggleMic,
    toggleScreenShare
  } = useWebRTC(roomId || '', userName);
  
  // Generate the full URL for the room
  const roomUrl = window.location.origin + '/room/' + roomId;

  // Copy room link to clipboard
  const copyRoomLink = () => {
    navigator.clipboard.writeText(roomUrl);
    toast({
      title: "Room link copied!",
      description: "Share this link with a friend to connect",
    });
  };

  // Send chat message
  const sendMessage = () => {
    if (message.trim()) {
      setChatMessages([...chatMessages, {text: message, isSelf: true}]);
      setMessage('');
      
      // Simulate response (in a real app, this would come from the other user via WebRTC)
      if (remoteParticipant) {
        setTimeout(() => {
          setChatMessages(prev => [...prev, {
            text: `Message received by ${remoteParticipant.displayName}`,
            isSelf: false
          }]);
        }, 500);
      }
    }
  };

  // Connect local stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Connect remote stream to video element
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Listen for remote participants
  useEffect(() => {
    // Update toast notifications for remote participants
    if (remoteParticipants.length > 0) {
      console.log("Remote participants updated:", remoteParticipants);
    }
  }, [remoteParticipants]);

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
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center mr-2" onClick={() => setShowQrCode(true)}>
                <QrCode size={16} className="mr-2" /> QR Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Room QR Code</DialogTitle>
                <DialogDescription>
                  Scan this QR code to join the room directly
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center p-4">
                <QRCodeSVG value={roomUrl} size={256} />
                <p className="mt-4 text-sm text-center text-muted-foreground break-all">
                  {roomUrl}
                </p>
                <Button className="mt-4 w-full" onClick={copyRoomLink}>
                  <Copy size={16} className="mr-2" /> Copy Link
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" className="flex items-center mr-2" onClick={copyRoomLink}>
            <Copy size={16} className="mr-2" /> Copy Link
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center mr-2">
                <Users size={16} className="mr-2" /> Participants ({remoteParticipants.length + 1})
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Room Participants</DialogTitle>
                <DialogDescription>
                  Currently in this room
                </DialogDescription>
              </DialogHeader>
              
              <div className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Camera</TableHead>
                      <TableHead>Mic</TableHead>
                      <TableHead>Sharing</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Current user (you) */}
                    <TableRow>
                      <TableCell className="flex items-center">
                        <Avatar className="h-8 w-8 mr-2 bg-purple-200">
                          <AvatarFallback>{userDisplayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span>
                          {userDisplayName} <Badge variant="outline">You</Badge>
                        </span>
                      </TableCell>
                      <TableCell>
                        {isCameraOn ? (
                          <span className="text-green-600 flex items-center">
                            <VideoIcon size={16} className="mr-1" /> On
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center">
                            <VideoOffIcon size={16} className="mr-1" /> Off
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isMicOn ? (
                          <span className="text-green-600 flex items-center">
                            <MicIcon size={16} className="mr-1" /> On
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center">
                            <MicOffIcon size={16} className="mr-1" /> Off
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isScreenSharing ? (
                          <span className="text-green-600 flex items-center">
                            <ScreenShareIcon size={16} className="mr-1" /> Yes
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center">
                            <ScreenShareOffIcon size={16} className="mr-1" /> No
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-600 flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> Active
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Remote participants */}
                    {remoteParticipants.map((participant) => (
                      <TableRow key={participant.userId}>
                        <TableCell className="flex items-center">
                          <Avatar className="h-8 w-8 mr-2 bg-green-200">
                            <AvatarFallback>{participant.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span>{participant.displayName}</span>
                        </TableCell>
                        <TableCell>
                          {participant.isCameraOn ? (
                            <span className="text-green-600 flex items-center">
                              <VideoIcon size={16} className="mr-1" /> On
                            </span>
                          ) : (
                            <span className="text-gray-400 flex items-center">
                              <VideoOffIcon size={16} className="mr-1" /> Off
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {participant.isMicOn ? (
                            <span className="text-green-600 flex items-center">
                              <MicIcon size={16} className="mr-1" /> On
                            </span>
                          ) : (
                            <span className="text-gray-400 flex items-center">
                              <MicOffIcon size={16} className="mr-1" /> Off
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {participant.isScreenSharing ? (
                            <span className="text-green-600 flex items-center">
                              <ScreenShareIcon size={16} className="mr-1" /> Yes
                            </span>
                          ) : (
                            <span className="text-gray-400 flex items-center">
                              <ScreenShareOffIcon size={16} className="mr-1" /> No
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600 flex items-center">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> Connected
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Show message if no remote users */}
                    {remoteParticipants.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-4">
                          No other participants yet. Share the room link to invite someone.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
          
          <ShareButton />
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center">
              <Avatar className="h-8 w-8 mr-2 bg-purple-200">
                <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-medium">{userName} (You)</span>
                <span className="text-xs text-gray-500">Host</span>
              </div>
              
              {/* Live participants indicator */}
              <div className="ml-4 flex items-center">
                <Badge variant="outline" className="flex items-center bg-green-50 text-green-700 border-green-200">
                  <Users size={14} className="mr-1" /> {remoteParticipants.length + 1} participant{remoteParticipants.length !== 0 ? 's' : ''}
                </Badge>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              {isConnected ? 
                <span className="text-green-500 font-medium flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> Connected
                </span> : 
                <span className="text-amber-500 font-medium flex items-center">
                  <span className="w-2 h-2 bg-amber-500 rounded-full mr-1"></span> Connecting...
                </span>
              }
              <span className="ml-2 text-xs text-gray-400">{connectionState}</span>
              {hasRemoteUser && (
                <span className="ml-2 text-green-500 font-medium flex items-center">
                  <User size={14} className="mr-1" /> {remoteParticipants.length} remote
                </span>
              )}
            </div>
          </div>
          
          {/* Show connected users avatars */}
          {remoteParticipants.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {remoteParticipants.map((participant) => (
                <div key={participant.userId} className="flex items-center bg-green-50 rounded-full px-2 py-1">
                  <Avatar className="h-6 w-6 mr-1 bg-green-200">
                    <AvatarFallback>{participant.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-green-700">{participant.displayName}</span>
                  <span className="ml-1 w-2 h-2 bg-green-500 rounded-full"></span>
                </div>
              ))}
            </div>
          )}
          
          <Tabs defaultValue="video" className="mb-6">
            <TabsList className="bg-purple-100">
              <TabsTrigger value="video" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                <VideoIcon size={16} className="mr-2" /> Video Chat
              </TabsTrigger>
              <TabsTrigger value="screen" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                <ScreenShareIcon size={16} className="mr-2" /> Screen Share
              </TabsTrigger>
            </TabsList>
            
            <div className="flex justify-end space-x-2 my-4">
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
            
            <TabsContent value="video" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Local video */}
                <Card className="aspect-video relative overflow-hidden border-primary/20 bg-white/90 backdrop-blur-sm">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {!isCameraOn && !isScreenSharing && (
                      <div className="text-center">
                        <VideoOffIcon size={48} className="text-muted-foreground mx-auto mb-4" />
                        <p className="text-lg font-medium text-purple-700">Your camera is off</p>
                        <Button 
                          onClick={toggleCamera}
                          className="mt-4 bg-purple-500 hover:bg-purple-600"
                        >
                          Turn On Camera
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`${(isCameraOn || isScreenSharing) ? "object-cover w-full h-full" : "hidden"}`}
                  ></video>
                  
                  <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 text-xs rounded flex items-center gap-2">
                    <Avatar className="h-6 w-6 bg-purple-200">
                      <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>{userName} (You)</span>
                    {isMicOn ? <MicIcon size={12} /> : <MicOffIcon size={12} />}
                  </div>
                </Card>
                
                {/* Remote video */}
                <Card className="aspect-video relative overflow-hidden border-primary/20 bg-white/90 backdrop-blur-sm">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {!hasRemoteUser ? (
                      <div className="text-center">
                        <VideoOffIcon size={48} className="text-muted-foreground mx-auto mb-4" />
                        <p className="text-lg font-medium text-purple-700">
                          Waiting for remote user...
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Share your room link with a friend to connect
                        </p>
                        
                        {/* If users are connected but no video */}
                        {remoteParticipants.length > 0 && (
                          <div className="mt-4 text-green-600">
                            <UserCheck size={24} className="mx-auto mb-2" />
                            <p>{remoteParticipants.length} user{remoteParticipants.length > 1 ? 's' : ''} connected without video</p>
                          </div>
                        )}
                      </div>
                    ) : remoteStream && remoteStream.getVideoTracks().length === 0 ? (
                      <div className="text-center">
                        <VideoOffIcon size={48} className="text-muted-foreground mx-auto mb-4" />
                        <p className="text-lg font-medium text-green-600">
                          {remoteParticipant ? remoteParticipant.displayName : 'User'} connected!
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Their camera is currently off
                        </p>
                      </div>
                    ) : null}
                  </div>
                  
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`${(hasRemoteUser && remoteStream && remoteStream.getVideoTracks().length > 0) ? "object-cover w-full h-full" : "hidden"}`}
                  ></video>
                  
                  {hasRemoteUser && (
                    <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 text-xs rounded flex items-center gap-2">
                      <Avatar className="h-6 w-6 bg-green-200">
                        <AvatarFallback>
                          {remoteParticipant ? remoteParticipant.displayName.slice(0, 2).toUpperCase() : 'RU'}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        {remoteParticipant ? remoteParticipant.displayName : 'Remote User'}
                      </span>
                      {remoteParticipant?.isMicOn ? <MicIcon size={12} /> : <MicOffIcon size={12} />}
                    </div>
                  )}
                </Card>
              </div>
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
                
                {isScreenSharing && (
                  <div className="absolute bottom-2 left-2 text-white bg-black/50 px-2 py-1 text-xs rounded flex items-center gap-2">
                    <Avatar className="h-6 w-6 bg-purple-200">
                      <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>{userName} (You)</span>
                    <ScreenShareIcon size={12} />
                  </div>
                )}
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
              <div className={`w-3 h-3 rounded-full ${hasRemoteUser ? 'bg-green-500' : 'bg-amber-500'}`}></div>
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
