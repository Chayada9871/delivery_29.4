import "./globals.css";
import { Prompt } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "Sophon Driver",
  description: "Delivery management system for Sophon workflow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={prompt.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
