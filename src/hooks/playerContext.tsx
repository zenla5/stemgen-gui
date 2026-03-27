import { createContext, useContext, ReactNode } from 'react';
import type { MultiStemPlayerState } from './useMultiStemPlayer';

// Player context type
export interface PlayerContextType {
  state: MultiStemPlayerState | null;
  togglePlay: (() => void) | null;
  seek: ((time: number) => void) | null;
  isLoaded: boolean;
}

// Create context with undefined default
export const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

// Provider component
export function PlayerProvider({ 
  children, 
  value 
}: { 
  children: ReactNode;
  value: PlayerContextType;
}) {
  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

// Hook to use player context
export function usePlayerContext(): PlayerContextType | undefined {
  return useContext(PlayerContext);
}
