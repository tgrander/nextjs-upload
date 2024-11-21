import { Workers } from "./_components/Workers";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Workers />
      {children}
    </div>
  );
}
