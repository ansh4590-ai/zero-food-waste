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
  const [idFile, setIdFile] = useState<File | null>(null);

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
        throw new Error(error.message);
      }

      toast.success("Registered successfully as Volunteer");
      navigate("/tasks");
    } catch (err: any) {
      toast.error(err.message || "An error occurred during registration");
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
          <label className="text-sm font-medium leading-none text-zinc-300">Full Name</label>
          <Input 
            name="name" 
            required 
            value={formData.name} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Email</label>
          <Input 
            name="email" 
            type="email" 
            required 
            value={formData.email} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Password</label>
          <Input 
            name="password" 
            type="password" 
            required 
            value={formData.password} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Phone Number</label>
          <Input 
            name="phone" 
            type="tel" 
            required 
            value={formData.phone} 
            onChange={handleChange} 
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500" 
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Vehicle Type</label>
          <select 
            name="vehicleType" 
            className="flex h-10 w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.vehicleType} 
            onChange={handleChange}
          >
            <option value="car" className="bg-zinc-900">Car</option>
            <option value="van" className="bg-zinc-900">Van / Minivan</option>
            <option value="truck" className="bg-zinc-900">Truck</option>
            <option value="bike" className="bg-zinc-900">Bicycle / Scooter</option>
            <option value="none" className="bg-zinc-900">No Vehicle (Walking)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Availability</label>
          <select 
            name="availability" 
            className="flex h-10 w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.availability} 
            onChange={handleChange}
          >
            <option value="weekdays" className="bg-zinc-900">Weekdays</option>
            <option value="weekends" className="bg-zinc-900">Weekends</option>
            <option value="evenings" className="bg-zinc-900">Evenings</option>
            <option value="anytime" className="bg-zinc-900">Anytime</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">ID Proof (Driver's License / State ID)</label>
          <Input 
            type="file" 
            accept="image/*,.pdf" 
            required 
            className="bg-zinc-900/50 border-white/10 text-zinc-400 file:text-white file:bg-zinc-800 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-md hover:file:bg-zinc-700" 
            onChange={(e) => setIdFile(e.target.files?.[0] || null)} 
          />
          <p className="text-xs text-zinc-500 mt-1">This will be reviewed during identity verification after signup.</p>
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
        <Link to="/register" className="text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors">
          ← Back to roles
        </Link>
      </div>
    </AuthLayout>
  );
}
