/**
 * Debug Visualization Configuration
 * Styling and settings for debug screenshot rendering
 */

export const debugVisualizationConfig = {
  boundingBox: {
    // Red color for debugging (indicates potential issue)
    color: '#FF0000',
    strokeWidth: 3,
    fillOpacity: 0.1,
  },
  text: {
    fontSize: 14,
    fontFamily: 'Arial, sans-serif',
    padding: 5,
    backgroundColor: '#FF0000',
    textColor: '#FFFFFF',
  },
  stepDescription: {
    fontSize: 16,
    fontFamily: 'Arial, sans-serif',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    textColor: '#FFFFFF',
    maxWidth: 800, // Max width for wrapping
  },
} as const;
