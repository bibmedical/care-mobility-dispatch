import 'jsvectormap/dist/jsvectormap.min.css';
// import '@/assets/scss/bootstrap.scss'
import '@/assets/scss/app.scss';
import '@/assets/scss/icons.scss';
import AppProvidersWrapper from "@/components/wrappers/AppProvidersWrapper";
import { DEFAULT_PAGE_TITLE } from "@/context/constants";

export const metadata = {
  title: {
    template: '%s | Florida Mobility Group Dispatch',
    default: DEFAULT_PAGE_TITLE
  },
  description: 'NEMT Operations Panel — trips, drivers, and dispatch management',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/fmg-app-icon.png', type: 'image/png' }
    ],
    apple: [
      { url: '/fmg-app-icon.png', type: 'image/png' }
    ],
    shortcut: ['/fmg-app-icon.png']
  },
  appleWebApp: {
    capable: true,
    title: 'FMG Dispatch',
    statusBarStyle: 'default'
  }
};
export default function RootLayout({
  children
}) {
  return <html lang="en">
      <body className={``}>
        <AppProvidersWrapper>{children}</AppProvidersWrapper>
      </body>
    </html>;
}