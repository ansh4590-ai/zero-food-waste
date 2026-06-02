import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAuthStore, useLoadingStore } from "../../store";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { AuthLayout } from "../../components/auth/AuthLayout";

export default function AdminSignup() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { isLoading, setLoading } = useLoadingStore();
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    adminSecret: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Securely delegate admin creation to the Express backend
      const response = await fetch("/api/auth/register-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          adminSecret: formData.adminSecret
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to register admin");
      }

      // Log the user into the local Supabase client after successful secure registration
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (signInError) {
        throw new Error("Registered successfully, but failed to log in automatically: " + signInError.message);
      }

      toast.success("Registration successful! Redirecting to admin panel...");
      setTimeout(() => navigate("/admin"), 1000);
    } catch (err: any) {
      toast.error(err.message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Admin Registration"
      subtitle="Restricted access. Enter your details and the admin secret key."
      illustrationText="Join the administrative team to manage and monitor the Zero Food Waste platform."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="fullName">
            Full Name
          </label>
          <Input 
            id="fullName" 
            name="fullName" 
            placeholder="John Doe" 
            required 
            value={formData.fullName}
            onChange={handleChange}
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="email">
            Email
          </label>
          <Input 
            id="email" 
            name="email" 
            type="email" 
            placeholder="admin@example.com" 
            required 
            value={formData.email}
            onChange={handleChange}
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="password">
            Password
          </label>
          <Input 
            id="password" 
            name="password" 
            type="password" 
            placeholder="••••••••"
            required 
            value={formData.password}
            onChange={handleChange}
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300" htmlFor="adminSecret">
            Admin Secret Key
          </label>
          <Input 
            id="adminSecret" 
            name="adminSecret" 
            type="password" 
            placeholder="Enter the secret key" 
            required 
            value={formData.adminSecret}
            onChange={handleChange}
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
          />
        </div>
        
        <Button 
          type="submit" 
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading}
        >
          {isLoading ? "Registering..." : "Register as Admin"}
        </Button>
      </form>

      <div className="mt-8 text-center border-t border-white/10 pt-6">
        <Link to="/admin-login" className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
          Already an admin? Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
