import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { 
  HeartHandshake, 
  Search, 
  Menu, 
  X, 
  User, 
  LogOut, 
  Sun, 
  Moon,
  LayoutDashboard,
  List,
  Activity,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useAuthStore } from "../store";
import { usePermissions, useUserRole } from "../hooks/useRBAC";
import { useTheme } from "../components/ThemeProvider";
import { NotificationBell } from "../components/NotificationBell";
import { Button } from "../components/ui/button";
import { AIChatbot } from "../components/AIChatbot";
import { toast } from "sonner";

export default function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const { can } = usePermissions();
  const { roles } = useUserRole();
  const primaryRole = roles?.[0] || 'donor';

  // Handle window resize for responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        setIsSidebarCollapsed(false);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen && window.innerWidth < 768) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const toggleTheme = () => {
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "light" : "dark");
  };

  // Define navigation items based on role
  const getNavigation = () => {
    const nav = [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ];

    // Role-specific Listings label
    let listingsLabel = "Listings";
    if (primaryRole === "donor") listingsLabel = "My Listings";
    if (primaryRole === "receiver") listingsLabel = "Available Food";
    if (primaryRole === "admin") listingsLabel = "All Listings";
    
    nav.push({ name: listingsLabel, href: "/listings", icon: List });
    nav.push({ name: "Activity", href: "/activity", icon: Activity });
    
    // Analytics for everyone, but mainly useful for donor/admin
    nav.push({ name: "Analytics", href: "/analytics", icon: BarChart3 });
    nav.push({ name: "Settings", href: "/settings", icon: Settings });

    return nav;
  };

  const navigation = getNavigation();

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-200">
      
      {/* ─── Mobile Drawer Overlay ─── */}
      <div 
        className={`sidebar-overlay md:hidden ${isMobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* ─── Sidebar ─── */}
      <aside 
        className={`app-sidebar ${isSidebarCollapsed ? 'app-sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'app-sidebar-mobile-open' : ''}`}
      >
        {/* Sidebar Header */}
        <div className="h-[var(--header-height)] flex items-center px-4 border-b border-sidebar-border shrink-0 justify-between">
          <Link to="/" className="flex items-center gap-2 min-w-0 overflow-hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <HeartHandshake className="h-7 w-7 text-primary shrink-0" />
            <span className="sidebar-label font-bold text-lg tracking-tight text-sidebar-foreground truncate">
              Zero Food Waste
            </span>
          </Link>
          
          {/* Mobile close button inside sidebar */}
          <button 
            className="md:hidden p-2 -mr-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sidebar Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1">
          <div className="px-3 mb-2 sidebar-label text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
            Main Menu
          </div>
          
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                title={isSidebarCollapsed ? item.name : undefined}
              >
                <item.icon className="nav-icon" />
                <span className="sidebar-label">{item.name}</span>
              </Link>
            );
          })}

          <div className="mt-8 mb-2 px-3 sidebar-label text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
            Quick Actions
          </div>
          
          {can("food.create") && (
            <Link to="/donate" className={`sidebar-nav-item ${location.pathname === "/donate" ? "active" : ""}`} title={isSidebarCollapsed ? "Donate Food" : undefined}>
              <HeartHandshake className="nav-icon text-emerald-500" />
              <span className="sidebar-label">Donate Food</span>
            </Link>
          )}
          
          <Link to="/browse" className={`sidebar-nav-item ${location.pathname === "/browse" ? "active" : ""}`} title={isSidebarCollapsed ? "Find Food" : undefined}>
            <Search className="nav-icon text-blue-500" />
            <span className="sidebar-label">Find Food</span>
          </Link>

          {can("tasks.view_assigned") && (
            <Link to="/tasks" className={`sidebar-nav-item ${location.pathname === "/tasks" ? "active" : ""}`} title={isSidebarCollapsed ? "My Tasks" : undefined}>
              <Activity className="nav-icon text-amber-500" />
              <span className="sidebar-label">My Tasks</span>
            </Link>
          )}

          {can("users.read") && (
            <Link to="/admin" className={`sidebar-nav-item ${location.pathname === "/admin" ? "active" : ""}`} title={isSidebarCollapsed ? "Admin Panel" : undefined}>
              <Settings className="nav-icon text-purple-500" />
              <span className="sidebar-label">Admin Panel</span>
            </Link>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="mt-auto p-4 border-t border-sidebar-border shrink-0">
          {/* Desktop collapse toggle */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-full p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors mb-4"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          
          <div className="flex items-center gap-3">
            <Link to="/profile" className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
              <User className="h-5 w-5" />
            </Link>
            <div className="sidebar-label flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.fullName || user?.email?.split('@')[0] || "User"}
              </p>
              <p className="text-xs text-sidebar-foreground/60 capitalize truncate">
                {primaryRole}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="sidebar-label p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-destructive transition-colors shrink-0"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Header ─── */}
      <header className={`app-header ${isSidebarCollapsed ? 'header-collapsed' : ''}`}>
        <div className="flex items-center gap-4 flex-1">
          {/* Mobile menu toggle */}
          <button 
            className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Global Search Placeholder */}
          <div className="global-search hidden sm:flex flex-1 max-w-md">
            <Search className="h-4 w-4 shrink-0" />
            <input 
              type="text" 
              placeholder="Search everywhere..." 
              readOnly 
              onClick={() => toast.info("Global search is coming soon!", { description: "We're indexing the platform data." })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground h-9 w-9"
          >
            {theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          
          <NotificationBell />
          
          <Link to="/profile" className="sm:hidden h-8 w-8 ml-1 rounded-full bg-surface-soft flex items-center justify-center text-primary border border-border">
            <User className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* ─── Main Content Area ─── */}
      <main className={`app-content ${isSidebarCollapsed ? 'app-content-collapsed' : ''}`}>
        <div className="h-full w-full max-w-[1600px] mx-auto animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* AI Chatbot — floating widget for all authenticated pages */}
      <AIChatbot />
      
    </div>
  );
}
