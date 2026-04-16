export default function manifest() {
  return {
    name: 'Florida Mobility Group Dispatch',
    short_name: 'FMG Dispatch',
    description: 'Local dispatch shortcut for trips, drivers, messages, and daily NEMT operations.',
    start_url: '/dispatcher',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f5132',
    icons: [
      {
        src: '/fmg-app-icon.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/fmg-app-icon.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  };
}