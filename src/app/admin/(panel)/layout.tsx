import AdminGuard from "@/components/admin/AdminGuard";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-[#06060B]">
        <AdminSidebar />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </AdminGuard>
  );
}
