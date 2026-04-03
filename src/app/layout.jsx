import { runMigrations } from '@/server/db-schema';
import 'jsvectormap/dist/jsvectormap.min.css';
// import '@/assets/scss/bootstrap.scss'
import '@/assets/scss/app.scss';
import '@/assets/scss/icons.scss';
import AppProvidersWrapper from "@/components/wrappers/AppProvidersWrapper";
import { DEFAULT_PAGE_TITLE } from "@/context/constants";
// Run DB migrations on server startup (non-blocking, safe to call multiple times)
runMigrations().catch(err => console.error('[DB] Migration error:', err));

export const metadata = {
  title: {
    template: '%s | Care Mobility Dispatch',
    default: DEFAULT_PAGE_TITLE
  },
  description: 'NEMT Operations Panel — trips, drivers, and dispatch management'
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