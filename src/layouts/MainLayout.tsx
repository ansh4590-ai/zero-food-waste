import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { HeartHandshake, Menu, X, User, Moon, Sun, LogOut, ArrowUp } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { useAuthStore, useLoadingStore } from "../store";
import { useTheme } from "../components/ThemeProvider";
import { usePermissions } from "../hooks/useRBAC";
import { NotificationBell } from "../components/NotificationBell";

export default function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { isLoading } = useLoadingStore();
  const { theme, setTheme } = useTheme();
  const { can } = usePermissions();

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const getNavigation = () => {
    const nav = [{ name: "Home", href: "/" }];
    
    if (isAuthenticated && user) {
      nav.push({ name: "Dashboard", href: "/dashboard" });
      
      if (can("food.create")) {
        nav.push({ name: "Donate Food", href: "/donate" });
      }
      
      // Browse is available to all authenticated users
      nav.push({ name: "Find Food", href: "/browse" });
      
      if (can("requests.read_own") || can("requests.create")) {
        nav.push({ name: "My Requests", href: "/requests" });
      }
      
      if (can("tasks.view_assigned")) {
        nav.push({ name: "My Tasks", href: "/tasks" });
      }
      
      if (can("users.read") || can("users.verify")) {
        nav.push({ name: "Admin", href: "/admin" });
      }
    }
    return nav;
  };

  const navigation = getNavigation();

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-200">
      {/* Global Loading Bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 h-1 z-[60] overflow-hidden bg-primary/20">
          <div className="h-full bg-primary animate-[pulse_1s_ease-in-out_infinite] w-full origin-left-right"></div>
        </div>
      )}

      <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-lg border-b border-border shadow-md" : "bg-transparent border-b border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex-shrink-0 flex items-center gap-2">
                <HeartHandshake className="h-8 w-8 text-primary" />
                <span className="font-bold text-xl tracking-tight text-foreground">Zero Food Waste</span>
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                      location.pathname === item.href
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => {
                  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                  setTheme(isDark ? "light" : "dark");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                {theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              
              {isAuthenticated ? (
                <>
                  <NotificationBell />
                  <div className="flex items-center gap-3 ml-2">
                  <button onClick={() => navigate("/profile")} className="h-8 w-8 rounded-full bg-surface-soft flex items-center justify-center text-primary border border-border hover:bg-surface transition-colors cursor-pointer outline-none" title="My Profile">
                      <User className="h-5 w-5" />
                    </button>
                    <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
                    <Link to="/auth/login">Login</Link>
                  </Button>
                  <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Link to="/register">Sign Up</Link>
                  </Button>
                </div>
              )}
            </div>
            <div className="-mr-2 flex items-center sm:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-main-menu"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-500 dark:text-gray-400"
              >
                {isMobileMenuOpen ? (
                  <X className="block h-6 w-6" />
                ) : (
                  <Menu className="block h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div id="mobile-main-menu" className="sm:hidden bg-background border-b border-border">
            <div className="pt-2 pb-3 space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                    location.pathname === item.href
                      ? "bg-surface border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:bg-surface-soft hover:border-border hover:text-foreground"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
              
              <div className="border-t border-border pt-4 pb-2">
                <div className="flex items-center px-4 justify-between">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="text-muted-foreground"
                  >
                    {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> Light Mode</> : <><Moon className="h-4 w-4 mr-2" /> Dark Mode</>}
                  </Button>
                </div>
                
                <div className="mt-3 px-2 space-y-1">
                  {isAuthenticated ? (
                    <>
                    <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => { navigate("/profile"); setIsMobileMenuOpen(false); }}>
                      <User className="h-4 w-4 mr-2" />
                      My Profile
                    </Button>
                    <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </>
                  ) : (
                    <>
                      <Button asChild variant="ghost" className="w-full justify-start">
                        <Link to="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>Login</Link>
                      </Button>
                      <Button asChild variant="ghost" className="w-full justify-start text-primary">
                        <Link to="/register" onClick={() => setIsMobileMenuOpen(false)}>Sign Up</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      <main className="flex-1 w-full flex flex-col">
        <Outlet />
      </main>

      <footer className="mt-auto w-full bg-background border-t border-border py-8 md:py-10 transition-colors duration-200 shrink-0 text-foreground">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-8 text-left">
            {/* Column 1: Brand & Identity */}
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-3 mb-4">
                <HeartHandshake className="h-6 w-6 text-primary" />
                <span className="font-bold text-lg text-foreground tracking-tight">Zero Food Waste</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mb-4">
                Our mission is to eliminate hunger and reduce food waste in India by connecting local communities, surplus food, and verified volunteers in real-time.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/50 backdrop-blur-md text-xs font-semibold text-muted-foreground shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Proudly Built in India
              </div>
            </div>
            
            {/* Column 2: Network */}
            <div className="flex flex-col items-start">
              <h4 className="font-semibold text-xs text-muted-foreground mb-4 uppercase tracking-widest">Network</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/register/donor" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    For Donors
                  </Link>
                </li>
                <li>
                  <Link to="/register/receiver" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    For NGOs & Shelters
                  </Link>
                </li>
                <li>
                  <Link to="/register/volunteer" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    For Volunteers
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Legal & Support */}
            <div className="flex flex-col items-start">
              <h4 className="font-semibold text-xs text-muted-foreground mb-4 uppercase tracking-widest">Legal & Support</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/privacy" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/support" className="hover:text-foreground hover:translate-x-1 inline-block transition-all duration-200">
                    Contact Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="pt-4 border-t border-border flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; {new Date().getFullYear()} Zero Food Waste. Operating across major Indian cities.
            </p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Link to="/privacy" className="hover:text-foreground transition-colors duration-200">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors duration-200">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
      
      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed right-6 p-3 rounded-full shadow-lg transition-all duration-300 z-[100] active:scale-95 ${scrolled ? "bg-[#2f6f57] text-white hover:bg-[#235844] translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"}`}
        style={{ 
          bottom: window.innerWidth < 640 
            ? 'calc(5.5rem + env(safe-area-inset-bottom))' 
            : '1.5rem' 
        }}
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      {/* Mobile Sticky Navigation CTA */}
      <nav aria-label="Mobile quick actions"
        className="sm:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-md border-t border-border z-50 flex items-center justify-between gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <Button asChild className="w-full flex-1 h-12 text-base font-bold shadow-lg" variant={isAuthenticated ? "outline" : "default"}>
          <Link to={isAuthenticated ? "/dashboard" : "/register"}>{isAuthenticated ? "Dashboard" : "Donate Food"}</Link>
        </Button>
        <Button asChild className="w-full flex-1 h-12 text-base font-bold shadow-lg bg-[#2f6f57] hover:bg-[#235844] text-white dark:bg-white dark:text-black dark:hover:bg-gray-200 border-none">
          <Link to="/browse">Find Food</Link>
        </Button>
      </nav>
    </div>
  );
}
