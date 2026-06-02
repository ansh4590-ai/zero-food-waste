import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Mail, Lock } from "lucide-react";
import { useLoadingStore } from "../../store";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { auth } from "../../firebase";
import { GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from "firebase/auth";
import { AuthLayout } from "../../components/auth/AuthLayout";

export default function Login() {
  const navigate = useNavigate();
  const { isLoading, setLoading } = useLoadingStore();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw new Error(error.message);
      }
      // Role-based redirection parsed dynamically from JWT claims
      const role = data.user?.user_metadata?.role || "donor";
      if (role === "admin") {
        await supabase.auth.signOut();
        throw new Error("Admins must use the dedicated Administrative Login Terminal. Unauthorized.");
      }
      
      toast.success("Logged in successfully");
      switch (role) {
        case "volunteer":
          navigate("/tasks");
          break;
        case "donor":
        case "receiver":
        case "ngo":
        default:
          navigate("/dashboard");
          break;
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const details = getAdditionalUserInfo(result);
      
      if (details?.isNewUser) {
        toast.info("Please complete your registration");
        navigate("/register");
      } else {
        toast.success("Logged in with Google successfully");
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in with Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account to continue"
      illustrationText="Welcome back to Zero Food Waste. Sign in to manage your profile and contribute to the community."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="email">
            Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-4 w-4 text-zinc-500" />
            </div>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="name@example.com" 
              className="pl-10 bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
              required 
              value={formData.email}
              onChange={handleChange}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="password">
              Password
            </label>
            <a href="#" className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
              Forgot password?
            </a>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-4 w-4 text-zinc-500" />
            </div>
            <Input 
              id="password" 
              name="password" 
              type="password" 
              placeholder="••••••••"
              className="pl-10 bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
              required 
              value={formData.password}
              onChange={handleChange}
            />
          </div>
        </div>
        
        <Button 
          type="submit" 
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading || isGoogleLoading}
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wider">
          <span className="bg-zinc-900 px-3 text-zinc-500 font-medium rounded-full">Or continue with</span>
        </div>
      </div>

      <Button 
        type="button" 
        variant="outline" 
        className="w-full bg-transparent border-white/10 text-white hover:bg-white/5 transition-all active:scale-[0.98]" 
        disabled={isLoading || isGoogleLoading}
        onClick={handleGoogleSignIn}
      >
        {isGoogleLoading ? (
          "Connecting to Google..."
        ) : (
          <>
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </>
        )}
      </Button>

      <div className="mt-8 text-center">
        <p className="text-sm text-zinc-400">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
