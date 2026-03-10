import { PublicHeader } from "@/components/PublicHeader";
import { Footer } from "@/components/Footer";
import styles from "./layout.module.css";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={styles.wrapper}>
      <PublicHeader />
      <div className={styles.main}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
