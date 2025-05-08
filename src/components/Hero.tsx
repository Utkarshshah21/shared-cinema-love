
import { Heart } from 'lucide-react';

const Hero = () => {
  return (
    <div className="text-center mb-8">
      <div className="flex items-center justify-center mb-4">
        <Heart className="h-8 w-8 text-love-500 mr-2 animate-pulse" />
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
          Shared Cinema Love
        </h1>
        <Heart className="h-8 w-8 text-love-500 ml-2 animate-pulse" />
      </div>
      <p className="text-xl text-purple-800 max-w-2xl mx-auto">
        Watch movies together, even when you're apart
      </p>
    </div>
  );
};

export default Hero;
