
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

const HeartButton = () => {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const sendHeart = () => {
    // Generate a random position for the heart
    const x = Math.random() * 100;
    const heartId = Date.now();
    
    // Add the new heart to the array
    setHearts([...hearts, { id: heartId, x, y: 0 }]);
    
    // Remove the heart after animation completes
    setTimeout(() => {
      setHearts(hearts => hearts.filter(heart => heart.id !== heartId));
    }, 3000);
  };

  return (
    <>
      <Button
        onClick={sendHeart}
        variant="outline"
        className="bg-love-100 border-love-200 hover:bg-love-200 text-love-700"
      >
        <Heart size={18} className="mr-2 text-love-500" fill="#f472b6" />
        Send Love
      </Button>
      
      {/* Render all hearts with unique positions */}
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="heart"
          style={{ left: `${heart.x}%`, bottom: '70px' }}
        >
          <Heart size={24} fill="#ec4899" stroke="#be185d" />
        </div>
      ))}
    </>
  );
};

export default HeartButton;
