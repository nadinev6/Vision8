import React, { useState, useEffect } from 'react';
import { Safari } from './ui/safari';
import './card.css';

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

// API Icon Component
const ApiIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "w-5 h-5", style }) => (
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
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

// GitHub Icon Component
const GitHubIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = "w-6 h-6", style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
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

          {/* Top Right - GitHub and Login */}
          <div className="flex items-center space-x-6">
            <a
              href="https://github.com/nadinev6/Vision8?tab=readme-ov-file#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 px-3 py-2 hover:bg-white/10 rounded-lg transition-all duration-200"
              style={{ color: '#ffffff' }}
              title="View on GitHub"
            >
              <GitHubIcon className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">GitHub</span>
            </a>
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
                    url="https://vision8-e7683.web.app"
                    videoSrc="/src/preview.mp4"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Overlay Taglines */}
                <div className="absolute inset-0 flex flex-col lg:flex-row justify-between items-start lg:items-end p-2 sm:p-4 md:p-6 lg:p-16 pointer-events-none z-20">
                  {/* Left Aligned Sub-tagline with Message Bubble */}
                  <div className="pointer-events-auto left-0 w-max lg:-ml-24">
                    <div className="bg-blue-100 rounded-lg sm:rounded-xl md:rounded-2xl px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-3 lg:px-6 lg:py-4 shadow-lg border border-blue-200/30">
                      <p className="text-xs sm:text-sm md:text-base lg:text-xl font-medium leading-relaxed text-gray-800">
                        The conversational engine<br className="md:hidden" />
                        <span className="hidden md:inline"> </span>for video intelligence.
                      </p>
                    </div>
                  </div>

                  {/* Right Aligned Main Tagline with Message Bubble - Moved further right and UP */}
                  <div className="lg:w-2/5 lg:flex lg:justify-end lg:self-center mt-2 sm:mt-3 md:mt-4 lg:-mt-16 pointer-events-auto -mr-1 sm:-mr-2 md:-mr-4 lg:-mr-24">
                    <div className="bg-blue-100 rounded-lg sm:rounded-xl md:rounded-2xl px-2 py-1 sm:px-3 sm:py-2 md:px-4 md:py-3 lg:px-6 lg:py-4 shadow-lg border border-blue-200/30 lg:text-right">
                      <p className="text-sm sm:text-base md:text-lg lg:text-2xl font-medium leading-tight text-gray-800">
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

      {/* Roadmap Section - Below the hero */}
      <div className="bg-white font-sans">

        {/* Roadmap Timeline */}
        <div className="py-16">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4 font-sans">Roadmap</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto font-sans">
                From prototype to the world's leading video AI platform
              </p>
            </div>

            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-1/2 transform -translate-x-px h-full w-0.5 bg-gray-300"></div>

              {/* Phase 1 */}
              <div className="relative flex items-center justify-between mb-16">
                <div className="w-5/12 text-right pr-8">
                  <div className="card" style={{ background: '#00ffa0', width: 'auto', maxWidth: '400px', marginLeft: 'auto' }}>
                    <div className="pricing-block-content">
                      <h3 className="pricing-plan">Phase 1: Infrastructure</h3>
                      <div className="pricing-note" style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Next 4 weeks</div>
                      <ul className="check-list">
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Migrate to cost-effective vector database
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Optimize deployment (80% cost reduction)
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Enhanced performance and reliability
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center z-10 transition-colors duration-300 cursor-pointer hover:bg-red-400" style={{ 'backgroundColor': 'rgb(37 99 235)', '--tw-bg-opacity': '1' } as React.CSSProperties} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff6b6b'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(37 99 235)'}>
                  <span className="text-white font-bold font-sans">1</span>
                </div>
                <div className="w-5/12"></div>
              </div>

              {/* Phase 2 */}
              <div className="relative flex items-center justify-between mb-16">
                <div className="w-5/12"></div>
                <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center z-10 transition-colors duration-300 cursor-pointer" style={{ 'backgroundColor': 'rgb(147 51 234)', '--tw-bg-opacity': '1' } as React.CSSProperties} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff6b6b'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(147 51 234)'}>
                  <span className="text-white font-bold font-sans">2</span>
                </div>
                <div className="w-5/12 pl-8">
                  <div className="card" style={{ background: '#ff6b9d', width: 'auto', maxWidth: '400px' }}>
                    <div className="pricing-block-content">
                      <h3 className="pricing-plan">Phase 2: Business Launch</h3>
                      <div className="pricing-note" style={{ fontWeight: '600', marginBottom: '0.5rem' }}>1-2 months</div>
                      <ul className="check-list">
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          User accounts and authentication
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Subscription plans and billing
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Video library management
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Public beta launch
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Phase 3 */}
              <div className="relative flex items-center justify-between mb-16">
                <div className="w-5/12 text-right pr-8">
                  <div className="card" style={{ background: '#4ecdc4', width: 'auto', maxWidth: '400px', marginLeft: 'auto' }}>
                    <div className="pricing-block-content">
                      <h3 className="pricing-plan">Phase 3: Advanced Features</h3>
                      <div className="pricing-note" style={{ fontWeight: '600', marginBottom: '0.5rem' }}>2-4 months</div>
                      <ul className="check-list">
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          AI video generation (Veo-3, Sora-2)
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Team collaboration tools
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          API for developers
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Advanced analytics
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center z-10 transition-colors duration-300 cursor-pointer" style={{ 'backgroundColor': 'rgb(22 163 74)', '--tw-bg-opacity': '1' } as React.CSSProperties} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff6b6b'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(22 163 74)'}>
                  <span className="text-white font-bold font-sans">3</span>
                </div>
                <div className="w-5/12"></div>
              </div>

              {/* Phase 4 */}
              <div className="relative flex items-center justify-between">
                <div className="w-5/12"></div>
                <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center z-10 transition-colors duration-300 cursor-pointer" style={{ 'backgroundColor': 'rgb(234 88 12)', '--tw-bg-opacity': '1' } as React.CSSProperties} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff6b6b'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(234 88 12)'}>
                  <span className="text-white font-bold font-sans">4</span>
                </div>
                <div className="w-5/12 pl-8">
                  <div className="card" style={{ background: '#ffa726', width: 'auto', maxWidth: '400px' }}>
                    <div className="pricing-block-content">
                      <h3 className="pricing-plan">Phase 4: Scale & Growth</h3>
                      <div className="pricing-note" style={{ fontWeight: '600', marginBottom: '0.5rem' }}>4-6 months</div>
                      <ul className="check-list">
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27-5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Enterprise features and SSO
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Mobile applications
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Global infrastructure
                        </li>
                        <li className="check-list-item">
                          <svg version="1.0" preserveAspectRatio="xMidYMid meet" height="16" viewBox="0 0 30 30.000001" width="16" xmlns="http://www.w3.org/2000/svg" style={{ color: '#05060f' }}>
                            <path fillRule="nonzero" fillOpacity="1" d="M 27.5 7.53125 L 24.464844 4.542969 C 24.15625 4.238281 23.65625 4.238281 23.347656 4.542969 L 11.035156 16.667969 L 6.824219 12.523438 C 6.527344 12.230469 6 12.230469 5.703125 12.523438 L 2.640625 15.539062 C 2.332031 15.84375 2.332031 16.335938 2.640625 16.640625 L 10.445312 24.324219 C 10.59375 24.472656 10.796875 24.554688 11.007812 24.554688 C 11.214844 24.554688 11.417969 24.472656 11.566406 24.324219 L 27.5 8.632812 C 27.648438 8.488281 27.734375 8.289062 27.734375 8.082031 C 27.734375 7.875 27.648438 7.679688 27.5 7.53125 Z M 27.5 7.53125" fill="#05060f" />
                          </svg>
                          Industry partnerships
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>





        {/* Footer */}
        <footer className="bg-white rounded-lg shadow-sm m-4 dark:bg-gray-800">
          <div className="w-full mx-auto max-w-screen-xl p-4">
            {/* Top row with copyright and links */}
            <div className="md:flex md:items-center md:justify-between">
              <span className="text-sm text-gray-500 sm:text-center dark:text-gray-400 flex items-center">
                © 2025
                <div className="flex items-center space-x-1 mx-1">
                  <span className="font-bold tracking-tight">VISION</span>
                  <InfinityIcon className="w-4 h-4" />
                </div>
                . All Rights Reserved.
              </span>
              <ul className="flex flex-wrap items-center mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 sm:mt-0">
                <li>
                  <a
                    href={import.meta.env?.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api/docs` : "https://vision8-backend-xyz-uc.a.run.app/api/docs"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline me-4 md:me-6"
                  >
                    API Docs
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/nadinev6/Vision8?tab=readme-ov-file#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline me-4 md:me-6"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:nadine@techie.com"
                    className="hover:underline"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            {/* Technology Stack - Centered at bottom */}
            <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-3 font-sans">Powered by</p>
                <div className="flex items-center justify-center space-x-6 opacity-70">
                  <div className="flex items-center space-x-2">
                    <img src="/icons/google-cloud.svg" alt="Google Cloud" className="w-5 h-5" />
                    <span className="text-xs text-gray-400 font-sans">Google Cloud</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <img src="/icons/elastic.svg" alt="Elasticsearch" className="w-5 h-5" />
                    <span className="text-xs text-gray-400 font-sans">Elasticsearch</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <img src="/icons/redis.svg" alt="Redis Cache" className="w-5 h-5" />
                    <span className="text-xs text-gray-400 font-sans">Redis</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;