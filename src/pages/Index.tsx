
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import Hero from '@/components/Hero';

const Index = () => {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const createRoom = () => {
    // Generate a random 6-character room code
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${newRoomCode}`);
    
    toast({
      title: "Room Created!",
      description: `Your room code is: ${newRoomCode}`,
    });
  };

  const joinRoom = () => {
    if (roomCode.trim().length === 0) {
      toast({
        title: "Room code required",
        description: "Please enter a room code to join",
        variant: "destructive"
      });
      return;
    }

    navigate(`/room/${roomCode.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Hero />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full mt-8">
        <Card className="shadow-lg border-primary/20 bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-purple-700">Create Session</CardTitle>
            <CardDescription className="text-center">
              Start a new movie night with your partner
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button 
              onClick={createRoom} 
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8 py-6"
            >
              Create Room
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-primary/20 bg-white/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-purple-700">Join Session</CardTitle>
            <CardDescription className="text-center">
              Enter your partner's room code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Input
                placeholder="Enter Room Code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="text-center uppercase tracking-widest font-bold"
                maxLength={6}
              />
            </div>
            <div className="flex justify-center">
              <Button 
                onClick={joinRoom}
                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white px-8 py-2"
              >
                Join Room
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>Shared Cinema Love &copy; {new Date().getFullYear()}</p>
        <p className="mt-1">Connect with your loved one from anywhere in the world</p>
      </footer>
    </div>
  );
};

export default Index;
