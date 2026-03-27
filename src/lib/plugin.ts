/**
 * Plugin System for Stemgen-GUI
 * 
 * Allows custom DJ format definitions and extensions.
 * Plugins can define custom stem orderings, metadata, and export settings.
 */

// Stem types supported by plugins
export type StemType = 'drums' | 'bass' | 'other' | 'vocals';

// Stem metadata for plugins
export interface PluginStemDefinition {
  id: string;
  type: StemType;
  name: string;
  color: string;
  description?: string;
}

// Export format settings
export interface PluginExportSettings {
  codec: 'aac' | 'alac' | 'wav' | 'flac' | 'mp3' | 'ogg';
  bitrate?: number; // for AAC/MP3
  sampleRate?: number;
  channels?: number;
}

// Plugin manifest - metadata about the plugin
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  website?: string;
  icon?: string; // base64 or URL
}

// Main DJ Format plugin interface
export interface DJFormatPlugin {
  manifest: PluginManifest;
  
  // Stem definitions for this format
  stems: PluginStemDefinition[];
  
  // Export settings for this format
  exportSettings: PluginExportSettings;
  
  // Whether this format requires master track
  hasMasterTrack?: boolean;
  
  // Optional custom metadata atom name (for .stem.mp4)
  metadataAtomName?: string;
  
  // Optional custom color scheme
  colorScheme?: {
    background?: string;
    text?: string;
    accent?: string;
  };
  
  // Lifecycle hooks
  onBeforeExport?: (stems: PluginStemDefinition[]) => Promise<void>;
  onAfterExport?: (outputPath: string) => Promise<void>;
}

// Plugin loader/manager
export interface PluginManager {
  // Load a plugin from a directory or manifest file
  loadPlugin(path: string): Promise<DJFormatPlugin>;
  
  // Unload a plugin
  unloadPlugin(pluginId: string): void;
  
  // Get all loaded plugins
  getLoadedPlugins(): DJFormatPlugin[];
  
  // Get a plugin by ID
  getPlugin(pluginId: string): DJFormatPlugin | undefined;
  
  // Get built-in formats
  getBuiltInFormats(): DJFormatPlugin[];
}

// Built-in DJ formats
export const BUILT_IN_FORMATS: DJFormatPlugin[] = [
  // Native Instrument (Traktor)
  {
    manifest: {
      id: 'ni-stem',
      name: 'NI Stem',
      version: '1.0.0',
      author: 'Native Instruments',
      description: 'Native Instruments .stem.mp4 format for Traktor',
    },
    stems: [
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
    ],
    exportSettings: {
      codec: 'aac',
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: true,
    metadataAtomName: 'NI stem metadata v1.0',
  },
  
  // Pioneer (rekordbox)
  {
    manifest: {
      id: 'pioneer-stem',
      name: 'Pioneer DJ',
      version: '1.0.0',
      author: 'Pioneer DJ',
      description: 'Pioneer DJ format for rekordbox',
    },
    stems: [
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
    ],
    exportSettings: {
      codec: 'aac',
      bitrate: 256,
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: false,
  },
  
  // Serato
  {
    manifest: {
      id: 'serato-stem',
      name: 'Serato DJ',
      version: '1.0.0',
      author: 'Serato',
      description: 'Serato DJ Stem format',
    },
    stems: [
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
    ],
    exportSettings: {
      codec: 'aac',
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: false,
  },
  
  // Mixxx (Open Source)
  {
    manifest: {
      id: 'mixxx-stem',
      name: 'Mixxx',
      version: '1.0.0',
      author: 'Mixxx Community',
      description: 'Mixxx compatible stem format',
    },
    stems: [
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
    ],
    exportSettings: {
      codec: 'alac',
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: false,
  },
  
  // djay (Algoriddim)
  {
    manifest: {
      id: 'djay-stem',
      name: 'djay Pro',
      version: '1.0.0',
      author: 'Algoriddim',
      description: 'djay Pro Neural Mix format',
    },
    stems: [
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
    ],
    exportSettings: {
      codec: 'aac',
      bitrate: 320,
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: false,
  },
  
  // VirtualDJ (Atomix)
  {
    manifest: {
      id: 'virtualdj-stem',
      name: 'VirtualDJ',
      version: '1.0.0',
      author: 'Atomix VirtualDJ',
      description: 'VirtualDJ Stem format',
    },
    stems: [
      { id: 'vocals', type: 'vocals', name: 'Vocals', color: '#95E1D3' },
      { id: 'drums', type: 'drums', name: 'Drums', color: '#FF6B6B' },
      { id: 'bass', type: 'bass', name: 'Bass', color: '#4ECDC4' },
      { id: 'other', type: 'other', name: 'Other', color: '#FFE66D' },
    ],
    exportSettings: {
      codec: 'aac',
      bitrate: 256,
      sampleRate: 44100,
      channels: 2,
    },
    hasMasterTrack: false,
  },
];

// Plugin manager implementation
export class PluginManagerImpl implements PluginManager {
  private plugins: Map<string, DJFormatPlugin> = new Map();
  
  async loadPlugin(path: string): Promise<DJFormatPlugin> {
    // In a real implementation, this would load from disk
    // For now, we'll support loading from a JSON manifest
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load plugin from ${path}`);
      }
      const plugin = await response.json() as DJFormatPlugin;
      
      // Validate plugin
      if (!this.validatePlugin(plugin)) {
        throw new Error('Invalid plugin manifest');
      }
      
      this.plugins.set(plugin.manifest.id, plugin);
      return plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin: ${error}`);
    }
  }
  
  unloadPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
  }
  
  getLoadedPlugins(): DJFormatPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  getPlugin(pluginId: string): DJFormatPlugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  getBuiltInFormats(): DJFormatPlugin[] {
    return BUILT_IN_FORMATS;
  }
  
  private validatePlugin(plugin: DJFormatPlugin): boolean {
    // Validate manifest
    if (!plugin.manifest?.id || !plugin.manifest?.name) {
      return false;
    }
    
    // Validate stems
    if (!Array.isArray(plugin.stems) || plugin.stems.length === 0) {
      return false;
    }
    
    // Validate export settings
    if (!plugin.exportSettings?.codec) {
      return false;
    }
    
    return true;
  }
}

// Singleton instance
let pluginManagerInstance: PluginManagerImpl | null = null;

export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManagerImpl();
  }
  return pluginManagerInstance;
}

// Plugin API for external use
export interface PluginAPI {
  // Get all available formats (built-in + loaded plugins)
  getAvailableFormats(): DJFormatPlugin[];
  
  // Get format by ID
  getFormat(formatId: string): DJFormatPlugin | undefined;
  
  // Load a custom plugin
  loadCustomPlugin(path: string): Promise<DJFormatPlugin>;
  
  // Get all loaded custom plugins
  getCustomPlugins(): DJFormatPlugin[];
  
  // Uninstall a custom plugin
  uninstallPlugin(pluginId: string): void;
}

// Plugin store for persistence
export interface PluginState {
  loadedPlugins: string[]; // paths to loaded plugins
  disabledPlugins: string[]; // plugin IDs that are disabled
}

// Create plugin hook for React components
export function usePlugins() {
  const manager = getPluginManager();
  
  return {
    formats: manager.getBuiltInFormats(),
    customPlugins: manager.getLoadedPlugins(),
    loadPlugin: manager.loadPlugin.bind(manager),
    unloadPlugin: manager.unloadPlugin.bind(manager),
    getPlugin: manager.getPlugin.bind(manager),
  };
}
