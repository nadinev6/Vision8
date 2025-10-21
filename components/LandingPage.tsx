import React, { useState, useEffect } from 'react';
import { Safari } from './ui/safari';

// Infinity SVG Icon Component
const InfinityIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "w-8 h-8", style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {/* Path for a clean number 8, fitting inside the 24x24 box */}
    <path d="M17.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-11 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
    {/* The actual infinity path you had before was:
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4s4-4 6-4a4 4 0 1 0 0 8c-2 0-4-1.33-6-4z"/>
    This new path represents a double circle, often used for infinity-like logos, but is smaller.
    For a strict '8' shape, you would need a different path.
    However, given your original Infinity path, this simple shape is most suitable to replace it cleanly.
    */}
  </svg>
);

// User Icon Component (for login button)
const UserIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// Hamburger Menu Icon Component
const MenuIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "w-6 h-6", style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

interface LandingPageProps {
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [glitchEffect, setGlitchEffect] = useState(false);

  useEffect(() => {
    // Random glitch effect
    const glitchInterval = setInterval(() => {
      if (Math.random() < 0.1) { // 10% chance every 2 seconds
        setGlitchEffect(true);
        setTimeout(() => setGlitchEffect(false), 150);
      }
    }, 2000);

    return () => clearInterval(glitchInterval);
  }, []);

  // Colour mapping:
  // (0.54 0.27 286.75) -> Main Title Colour
  // (0.81 0.10 19.58) -> Taglines Colour

  return (
    <>
      <style>{`
        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }
        .glitch-effect {
          animation: glitch 0.1s infinite;
        }
        /* Custom utility for main title color */
        .text-vision-main {
          color: oklch(0.54 0.27 286.75);
        }
        /* Custom utility for tagline color */
        .text-vision-tagline {
          color: oklch(0.81 0.10 19.58);
        }
      `}</style>

      <div className="min-h-screen relative overflow-hidden"
        style={{
          borderRadius: '12px', // Softly rounded corners like old monitor
          margin: '8px', // Small margin to show the rounded effect
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.1)' // Subtle inner shadow
        }}>

        {/* Background Image with Blur - Using public image */}
        <img
          src="/src/BG.png"
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover blur-sm z-0"
          style={{ filter: 'blur(2px)' }}
          onLoad={() => console.log('✅ Background image loaded successfully')}
          onError={(e) => {
            console.error('❌ Background image failed to load:', e);
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
          }}
        />

        {/* Fallback solid color if image doesn't load */}
        <div className="absolute inset-0 w-full h-full bg-gray-800 -z-10" />

        {/* Retro CRT Static Effect (Unchanged) */}
        <div className={`absolute inset-0 opacity-5 pointer-events-none ${glitchEffect ? 'glitch-effect' : ''}`}>
          <div className="w-full h-full"
            style={{
              backgroundImage: `repeating-linear-gradient(
                   0deg,
                   transparent,
                   transparent 2px,
                   rgba(255,255,255,0.03) 2px,
                   rgba(255,255,255,0.03) 4px
                 )`
            }} />
        </div>

        {/* Vertical Banding Effect (Unchanged) */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="w-full h-full"
            style={{
              backgroundImage: `repeating-linear-gradient(
                   90deg,
                   transparent,
                   transparent 1px,
                   rgba(0,0,0,0.1) 1px,
                   rgba(0,0,0,0.1) 2px
                 )`
            }} />
        </div>

        {/* Top Navigation - FIXED LOGO ALIGNMENT */}
        <nav className="relative z-10 flex items-center justify-between p-8">
          {/* Top Left - Logo and Infinity - Swapped order and adjusted spacing */}
          <div className="flex items-center space-x-1">
            <div className="text-2xl font-bold tracking-tight" style={{ color: '#ffffff' }}>
              VISION
            </div>
            <InfinityIcon className="w-6 h-6" style={{ color: '#ffffff' }} />
          </div>

          {/* Top Right - Menu and Login (Unchanged) */}
          <div className="flex items-center space-x-6">
            <MenuIcon className="w-6 h-6" style={{ color: '#ffffff' }} />
            <button
              onClick={onLogin}
              className="flex items-center space-x-2 px-4 py-2 border border-white/20 hover:border-white/40 rounded transition-all duration-200"
              style={{ color: '#ffffff' }}
            >
              <UserIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Login</span>
            </button>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="relative z-10 flex flex-col justify-center min-h-[calc(100vh-200px)] px-8">
          <div className="max-w-7xl mx-auto w-full">

            {/* Safari Mockup with Overlay Taglines */}
            <div className="relative mb-16">
              <div className="max-w-4xl w-full mx-auto">
                {/* Glassmorphic Border Container */}
                <div className="relative p-1.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-2xl">
                  <Safari
                    url="vision8.ai/dashboard"
                    imageSrc="https://i.imghippo.com/files/RtWL6472gPs.png"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Overlay Taglines */}
                <div className="absolute inset-0 flex flex-col lg:flex-row justify-between items-start lg:items-end p-8 lg:p-12 pointer-events-none z-20">
                  {/* Left Aligned Sub-tagline with Message Bubble */}
                  <div className="lg:w-1/2 pointer-events-auto">
                    <div className="bg-blue-100 rounded-2xl px-6 py-4 shadow-lg border border-blue-200/30">
                      <p className="text-xl lg:text-2xl font-normal leading-relaxed text-gray-800">
                        The Conversational Engine for Video Intelligence.
                      </p>
                    </div>
                  </div>

                  {/* Right Aligned Main Tagline with Message Bubble - Moved further right and UP */}
                  <div className="lg:w-2/5 lg:flex lg:justify-end lg:self-center mt-8 lg:-mt-16 pointer-events-auto -mr-12 lg:-mr-24">
                    <div className="bg-gray-900 rounded-2xl px-6 py-4 shadow-lg border border-blue-200/30 lg:text-right">
                      <p className="text-2xl lg:text-4xl font-medium leading-tight text-white">
                        The Future of<br />
                        Video Search.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Subtle Creative Strategy Text - FIXED OVERLAP */}
        {/* Changed 'bottom-32' to 'bottom-8' and moved outside of main/max-width container
          to be absolute to the main container (div.min-h-screen).
          Also, adjusted position to bottom-left to prevent overlap with the bottom-right text.
        */}
        <div className="absolute bottom-8 left-8 z-10">
          <p className="text-lg italic opacity-60" style={{ color: '#ffffff' }}>
            AI Deconstruction for Unfiltered Video
          </p>
        </div>

        {/* Bottom Right Corner Text (Unchanged position) */}
        <div className="absolute bottom-8 right-8 text-right z-10">
          <div className="text-2xl lg:text-3xl font-light leading-tight" style={{ color: '#ffffff' }}>
            Video<br />
            Insights in<br />
            Every Frame
          </div>
        </div>
      </div>
    </>
  );
};

export default LandingPage;