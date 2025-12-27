import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

// Generate Video Icon
interface AiGenerate2LineProps extends React.SVGProps<SVGSVGElement> {
  forceWhite?: boolean;
}

export const AiGenerate2Line: React.FC<AiGenerate2LineProps> = ({ forceWhite = false, ...props }) => {
  const { theme } = useTheme();
  const iconColor = forceWhite ? 'white' : (theme === 'dark' ? '#8fbffa' : '#2859c5');
  
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
      <path fill={iconColor} d="m19.713 8.128l-.246.566a.506.506 0 0 1-.934 0l-.246-.566a4.36 4.36 0 0 0-2.22-2.25l-.759-.339a.53.53 0 0 1 0-.963l.717-.319a4.37 4.37 0 0 0 2.251-2.326l.253-.611a.506.506 0 0 1 .942 0l.253.61a4.37 4.37 0 0 0 2.25 2.327l.718.32a.53.53 0 0 1 0 .962l-.76.338a4.36 4.36 0 0 0-2.219 2.251M19 11a6 6 0 0 0 2-.341v9.348a.994.994 0 0 1-.993.993H3.993A.993.993 0 0 1 3 20.007V3.993C3 3.445 3.445 3 3.993 3h9.348A6 6 0 0 0 19 11m-8.378-2.585a.4.4 0 0 0-.622.332v6.506a.4.4 0 0 0 .622.332l4.879-3.252a.4.4 0 0 0 0-.666z"/>
    </svg>
  );
}

// Generate Image Icon
export const GenerateImageIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" {...props}>
    <g fill="none" fillRule="evenodd" clipRule="evenodd">
      <path fill="#8fbffa" d="M.076 8.846c0 .943.765 1.708 1.708 1.708H5.34c-.107-.993.46-2.059 1.7-2.275a1.43 1.43 0 0 0 1.147-1.092l.023-.105c.304-1.388 1.677-1.895 2.758-1.514V1.77c0-.944-.765-1.708-1.708-1.708H1.784A1.71 1.71 0 0 0 .076 1.77z"/>
      <path fill="#2859c5" d="M9.304 3.21a1.371 1.371 0 1 1-2.742 0a1.371 1.371 0 0 1 2.742 0M5.34 10.554c-.105-.973.437-2.016 1.626-2.26l-.23-.37C5.04 5.67 2.506 5.572.076 6.1v2.745c0 .943.765 1.708 1.708 1.708H5.34ZM9.43 7.35c.19-.869 1.427-.874 1.625-.007l.01.043l.02.086a2.69 2.69 0 0 0 2.16 2.037c.905.158.905 1.457 0 1.614a2.69 2.69 0 0 0-2.164 2.055l-.026.112c-.198.867-1.434.862-1.625-.007l-.02-.097a2.68 2.68 0 0 0-2.156-2.064c-.904-.157-.904-1.454 0-1.611a2.68 2.68 0 0 0 2.153-2.054l.016-.071z"/>
    </g>
  </svg>
)

// Upload Image Icon
export const Image: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32" {...props}>
    <path fill="currentColor" d="M2 5v22h28V5zm2 2h24v13.906l-5.281-5.312l-.719-.719l-4.531 4.531l-5.75-5.812l-.719-.719l-7 7zm20 2a1.999 1.999 0 1 0 0 4a1.999 1.999 0 1 0 0-4zm-13 6.719L20.188 25H4v-2.281zm11 2l6 6V25h-4.969l-4.156-4.188z"></path>
  </svg>
)


//Coins

export const CoinexSmartChain: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M14.474 8.965a3.11 3.11 0 0 1 3.3 1.404a3.095 3.095 0 0 1-1.798 4.608a3.11 3.11 0 0 1-3.382-1.193a3.1 3.1 0 0 1-.57-1.79H9.276a5.84 5.84 0 0 0 1.19 3.538a5.873 5.873 0 0 0 9.683-.496a5.84 5.84 0 0 0-.732-7.035a5.865 5.865 0 0 0-6.987-1.19a5.9 5.9 0 0 1 2.044 2.154"></path>
    <path fill="currentColor" d="M9.526 15.035a3.11 3.11 0 0 1-3.3-1.404a3.095 3.095 0 0 1 1.797-4.609a3.11 3.11 0 0 1 3.383 1.192c.37.524.57 1.15.57 1.79h2.747a5.84 5.84 0 0 0-1.19-3.537a5.873 5.873 0 0 0-9.683.497a5.84 5.84 0 0 0 .733 7.035a5.865 5.865 0 0 0 6.986 1.19a5.9 5.9 0 0 1-2.043-2.154"></path>
</svg>
    )
