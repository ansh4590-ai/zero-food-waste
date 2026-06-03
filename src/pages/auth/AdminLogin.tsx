import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Mail, Lock } from "lucide-react";
import { useLoadingStore } from "../../store";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { AuthLayout } from "../../components/auth/AuthLayout";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { isLoading, setLoading } = useLoadingStore();
  
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
        throw new Error((error as Error).message);
      }

      // Admin-only routing validation
      const role = data.user?.user_metadata?.role || "donor";
      if (role !== "admin") {
         await supabase.auth.signOut();
         throw new Error("Unauthorized Portal. Administrative credentials required.");
      }

      toast.success("Logged in successfully");
      navigate("/admin");
    } catch (err: unknown) {
      toast.error((err as Error).message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };


  return (
    <AuthLayout
      title="Admin Operations Portal"
      subtitle="Restricted access limits. Provide service tier credentials."
      illustrationText="Access the core operations panel for managing system integrity and verifying platform users."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="email">
            Admin Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-4 w-4 text-zinc-500" />
            </div>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              placeholder="admin@zerofoodwaste.in" 
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
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading}
        >
          {isLoading ? "Authenticating..." : "Sign in as Admin"}
        </Button>
      </form>

      <div className="mt-8 text-center border-t border-white/10 pt-6">
        <p className="text-sm text-zinc-400">
          Authorised administrative personnel only.<br/>
          Contact <span className="font-medium text-emerald-400">support@zerofoodwaste.in</span> for access issues.
        </p>
      </div>
    </AuthLayout>
  );
}
