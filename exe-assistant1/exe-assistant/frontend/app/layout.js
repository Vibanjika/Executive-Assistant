import "./globals.css";
export const metadata = { title: "Exe Assistant", description: "Your inbox, sorted and answered." };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
