import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLoadingStore } from "../../store";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { AuthLayout } from "../../components/auth/AuthLayout";

export default function VolunteerSignup() {
  const navigate = useNavigate();
  const { isLoading, setLoading } = useLoadingStore();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    vehicleType: "car",
    availability: "weekends",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
            role: 'volunteer',
            phone: formData.phone,
            vehicle_type: formData.vehicleType,
            availability: formData.availability
          }
        }
      });

      if (error) {
        throw new Error((error as Error).message);
      }

      toast.success("Registered successfully as Volunteer");
      navigate("/tasks");
    } catch (err: unknown) {
      toast.error((err as Error).message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Volunteer Registration"
      subtitle="Sign up to help transport food to those in need."
      illustrationText="Be the bridge between surplus food and the people who need it most."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Full Name</label>
          <Input 
            name="name" 
            required 
            value={formData.name} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Email</label>
          <Input 
            name="email" 
            type="email" 
            required 
            value={formData.email} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Password</label>
          <Input 
            name="password" 
            type="password" 
            required 
            value={formData.password} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Phone Number</label>
          <Input 
            name="phone" 
            type="tel" 
            required 
            value={formData.phone} 
            onChange={handleChange} 
            className="bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Vehicle Type</label>
          <select 
            name="vehicleType" 
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.vehicleType} 
            onChange={handleChange}
          >
            <option value="car" className="bg-card">Car</option>
            <option value="van" className="bg-card">Van / Minivan</option>
            <option value="truck" className="bg-card">Truck</option>
            <option value="bike" className="bg-card">Bicycle / Scooter</option>
            <option value="none" className="bg-card">No Vehicle (Walking)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-foreground">Availability</label>
          <select 
            name="availability" 
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.availability} 
            onChange={handleChange}
          >
            <option value="weekdays" className="bg-card">Weekdays</option>
            <option value="weekends" className="bg-card">Weekends</option>
            <option value="evenings" className="bg-card">Evenings</option>
            <option value="anytime" className="bg-card">Anytime</option>
          </select>
        </div>

        <div className="p-3 rounded-lg bg-orange-950/30 border border-orange-500/20 text-xs text-warning flex items-start gap-2">
          <span>🛡️</span>
          <span>
            Identity verification is completed securely in the Smart KYC portal after registration.
          </span>
        </div>
        
        <Button 
          type="submit" 
          className="w-full mt-6 bg-orange-600 hover:bg-orange-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading}
        >
          {isLoading ? "Registering..." : "Register as Volunteer"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link to="/register" className="text-sm font-medium text-warning hover:text-orange-300 transition-colors">
          ← Back to roles
        </Link>
      </div>
    </AuthLayout>
  );
}
