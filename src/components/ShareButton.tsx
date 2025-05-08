
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScreenShareIcon } from 'lucide-react';

const ShareButton = () => {
  const [isSharing, setIsSharing] = useState<boolean>(false);

  const toggleShare = () => {
    setIsSharing(!isSharing);
    // This could be connected to actual WebRTC functionality in the future
  };

  return (
    <Button
      onClick={toggleShare}
      variant="outline"
      className="bg-purple-100 border-purple-200 hover:bg-purple-200 text-purple-700"
    >
      <ScreenShareIcon size={18} className="mr-2 text-purple-500" />
      Share Session
    </Button>
  );
};

export default ShareButton;
