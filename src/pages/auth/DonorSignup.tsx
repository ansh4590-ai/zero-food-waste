import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useLoadingStore } from "../../store";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { AddressAutocomplete } from "../../components/common/AddressAutocomplete";
import type { Suggestion } from "../../hooks/useAddressAutocomplete";

export default function DonorSignup() {
  const navigate = useNavigate();
  const { isLoading, setLoading } = useLoadingStore();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    donorType: "restaurant",
    address: "",
    lat: 0,
    lng: 0,
  });

  const handleAddressSelect = (suggestion: Suggestion) => {
    const fullAddress = suggestion.secondaryText
      ? `${suggestion.primaryText}, ${suggestion.secondaryText}`
      : suggestion.primaryText;
    setFormData(prev => ({ ...prev, address: fullAddress, lat: suggestion.lat, lng: suggestion.lng }));
  };

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
            role: 'donor',
            phone: formData.phone,
            donor_type: formData.donorType,
          }
        }
      });

      if (error) {
        throw new Error((error as Error).message);
      }

      toast.success("Registered successfully as Donor");
      navigate("/dashboard");
    } catch (err: unknown) {
      toast.error((err as Error).message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Donor Registration"
      subtitle="Sign up to start donating surplus food."
      illustrationText="Join thousands of donors reducing food waste and feeding the community."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Name / Business Name</label>
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
          <label className="text-sm font-medium leading-none text-zinc-300">Donor Type</label>
          <select 
            name="donorType" 
            className="flex h-10 w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            value={formData.donorType} 
            onChange={handleChange}
          >
            <option value="restaurant" className="bg-zinc-900">Restaurant / Cafe</option>
            <option value="grocery" className="bg-zinc-900">Grocery Store</option>
            <option value="event" className="bg-zinc-900">Event Organizer</option>
            <option value="individual" className="bg-zinc-900">Individual</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Address</label>
          <AddressAutocomplete
            name="address"
            value={formData.address}
            onChange={(val) => setFormData(prev => ({ ...prev, address: val }))}
            onSelect={handleAddressSelect}
            placeholder="Start typing address or pincode..."
            className="bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-500 focus-visible:ring-emerald-500"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium leading-none text-zinc-300">Profile Photo (Optional)</label>
          <Input 
            type="file" 
            accept="image/*" 
            className="bg-zinc-900/50 border-white/10 text-zinc-400 file:text-white file:bg-zinc-800 file:border-0 file:mr-4 file:py-1 file:px-3 file:rounded-md hover:file:bg-zinc-700" 
          />
        </div>
        
        <Button 
          type="submit" 
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98]" 
          disabled={isLoading}
        >
          {isLoading ? "Registering..." : "Register as Donor"}
        </Button>
      </form>
      
      <div className="mt-6 text-center">
        <Link to="/register" className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
          ← Back to roles
        </Link>
      </div>
    </AuthLayout>
  );
}
