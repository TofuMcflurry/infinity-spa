import AppSidebar from '@/Components/Customer/AppSidebar';
import BottomNav from '@/Components/Customer/BottomNav';
import FloatingConcierge from '@/Components/Customer/FloatingConcierge';

export default function AuthenticatedLayout({ children }) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 min-h-screen overflow-y-auto pb-24 md:pb-0">
        {children}
      </div>
      <BottomNav />
      <FloatingConcierge />
    </div>
  );
}