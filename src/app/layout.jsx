import 'jsvectormap/dist/jsvectormap.min.css';
// import '@/assets/scss/bootstrap.scss'
import '@/assets/scss/app.scss';
import '@/assets/scss/icons.scss';
import AppProvidersWrapper from "@/components/wrappers/AppProvidersWrapper";
import { DEFAULT_PAGE_TITLE } from "@/context/constants";
export const metadata = {
  title: {
    template: '%s | Care Mobility Dispatch',
    default: DEFAULT_PAGE_TITLE
  },
  description: 'Panel NEMT para operaciones, viajes y conductores'
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